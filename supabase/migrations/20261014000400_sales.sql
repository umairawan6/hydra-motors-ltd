begin;
create table public.billing_settings(id integer primary key default 1 check(id=1),company_name text not null,address text not null,registration_number text not null,email text not null default '',phone text not null default '',payment_details text not null default '',terms text not null,tax_mode text not null default 'none' check(tax_mode='none'),approved boolean not null default false,updated_at timestamptz not null default now());
alter table public.billing_settings enable row level security;
grant select on public.billing_settings to authenticated;
revoke all on public.billing_settings from anon;
create policy billing_read on public.billing_settings for select to authenticated using(public.is_active());
create table public.invoice_sequences(kind text primary key,next_value bigint not null default 1 check(next_value>0));
insert into public.invoice_sequences(kind) values('customer'),('credit'),('finance');
alter table public.invoice_sequences enable row level security;
revoke all on public.invoice_sequences from anon,authenticated;
alter table public.sales drop constraint sales_vehicle_id_key;
alter table public.sales add column list_price numeric(12,2) not null default 0;
alter table public.sales add column discount numeric(12,2) not null default 0;
alter table public.sales add column fees numeric(12,2) not null default 0;
alter table public.sales add column fee_description text not null default '';
alter table public.sales add column credited_amount numeric(12,2) not null default 0 check(credited_amount>=0 and credited_amount<=sale_price);
alter table public.sales add column version integer not null default 1;
alter table public.sales add column issued_at timestamptz;
alter table public.sales add column snapshot jsonb;
update public.sales set list_price=sale_price;
create unique index one_active_sale_per_vehicle on public.sales(vehicle_id) where status='draft' or (status='issued' and credited_amount<sale_price);
alter table public.invoices drop constraint invoices_invoice_type_check;
alter table public.invoices add constraint invoices_type_check check(invoice_type in ('customer','finance','credit'));
alter table public.invoices add column document_number text unique;
alter table public.invoices add column snapshot jsonb;
alter table public.invoices add column total numeric(12,2);
alter table public.invoices add column original_invoice_id uuid references public.invoices(id);
alter table public.invoices add column request_key uuid unique;
alter table public.invoices add column request_data jsonb;
alter table public.invoices add column pdf_status text not null default 'pending' check(pdf_status in ('pending','ready','failed'));
update public.invoices i set document_number=s.invoice_number||case when i.version>1 then '-V'||i.version else '' end from public.sales s where i.sale_id=s.id and i.invoice_type='customer' and s.invoice_number is not null;
alter table public.payments add column kind text not null default 'receipt' check(kind in ('receipt','refund'));
alter table public.payments add column original_payment_id uuid references public.payments(id);
alter table public.payments add column request_key uuid unique;
alter table public.payments add column reference text not null default '';

create function public.can_access_sale(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.is_active() and exists(select 1 from public.sales where id=target and (public.has_permission('sales.read_all') or (created_by=auth.uid() and public.has_permission('sales.write'))))
$$;
create function public.sale_balance(target uuid) returns numeric language plpgsql stable security definer set search_path='' as $$
declare result numeric; begin
  if not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
  select s.sale_price-s.credited_amount-coalesce((select sum(case when p.kind='receipt' then p.amount else -p.amount end) from public.payments p where p.sale_id=s.id),0) into result from public.sales s where s.id=target;
  return result;
end $$;
create function public.next_invoice_number(document_kind text) returns text language plpgsql security definer set search_path='' as $$
declare counter bigint; result text; begin
  loop
    update public.invoice_sequences set next_value=next_value+1 where kind=document_kind returning next_value-1 into counter;
    if not found then raise exception 'Unknown invoice series'; end if;
    result:='HM-'||case document_kind when 'customer' then 'S' when 'credit' then 'C' else 'F' end||'-'||lpad(counter::text,greatest(6,length(counter::text)),'0');
    exit when not exists(select 1 from public.invoices where document_number=result) and not exists(select 1 from public.sales where invoice_number=result);
  end loop; return result;
end $$;
revoke all on function public.next_invoice_number(text) from public,anon,authenticated;

create function public.save_billing_settings(payload jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
  perform pg_advisory_xact_lock(8141402);
  if not exists(select 1 from public.profiles where id=auth.uid() and active and role='admin') then raise exception 'Access denied' using errcode='42501'; end if;
  if payload is null or char_length(trim(coalesce(payload->>'company_name',''))) not between 1 and 120
    or char_length(trim(coalesce(payload->>'address',''))) not between 1 and 1000
    or char_length(trim(coalesce(payload->>'registration_number',''))) not between 1 and 40
    or char_length(trim(coalesce(payload->>'terms',''))) not between 1 and 5000
    or char_length(coalesce(payload->>'email',''))>254 or char_length(coalesce(payload->>'phone',''))>40
    or char_length(coalesce(payload->>'payment_details',''))>1000
    or not coalesce((payload->>'approved')::boolean,false) then raise exception 'Confirm valid dealership details and invoice terms'; end if;
  insert into public.billing_settings(id,company_name,address,registration_number,email,phone,payment_details,terms,approved)
    values(1,trim(payload->>'company_name'),trim(payload->>'address'),trim(payload->>'registration_number'),coalesce(payload->>'email',''),coalesce(payload->>'phone',''),coalesce(payload->>'payment_details',''),trim(payload->>'terms'),true)
    on conflict(id) do update set company_name=excluded.company_name,address=excluded.address,registration_number=excluded.registration_number,email=excluded.email,phone=excluded.phone,payment_details=excluded.payment_details,terms=excluded.terms,approved=true,updated_at=now();
end $$;

create function public.save_sale_draft(payload jsonb,expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; customer uuid; vehicle uuid; price numeric; discount_value numeric; fees_value numeric; existing public.sales; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('sales.write') then raise exception 'Access denied' using errcode='42501'; end if;
  target:=nullif(payload->>'id','')::uuid; customer:=(payload->>'customer_id')::uuid; vehicle:=(payload->>'vehicle_id')::uuid;
  price:=(payload->>'list_price')::numeric; discount_value:=coalesce((payload->>'discount')::numeric,0); fees_value:=coalesce((payload->>'fees')::numeric,0);
  if price is null or price<=0 or least(discount_value,fees_value)<0 or discount_value>price or price-discount_value+fees_value<=0 or price-discount_value+fees_value>9999999999.99
    or price<>round(price,2) or discount_value<>round(discount_value,2) or fees_value<>round(fees_value,2) or char_length(coalesce(payload->>'fee_description',''))>300 or (fees_value>0 and trim(coalesce(payload->>'fee_description',''))='') then raise exception 'Invalid money amount'; end if;
  if not exists(select 1 from public.customers where id=customer and not archived) then raise exception 'Choose an active customer'; end if;
  perform 1 from public.vehicles where id=vehicle and status in ('available','reserved') for update; if not found then raise exception 'Vehicle is not available'; end if;
  if target is null then
    insert into public.sales(customer_id,vehicle_id,sale_price,list_price,discount,fees,fee_description,created_by) values(customer,vehicle,price-discount_value+fees_value,price,discount_value,fees_value,coalesce(payload->>'fee_description',''),auth.uid()) returning id into target;
  else
    select * into existing from public.sales where id=target for update;
    if not found or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
    if existing.status<>'draft' or existing.version<>expected_version then raise exception 'Draft changed. Refresh before saving'; end if;
    update public.sales set customer_id=customer,vehicle_id=vehicle,sale_price=price-discount_value+fees_value,list_price=price,discount=discount_value,fees=fees_value,fee_description=coalesce(payload->>'fee_description',''),version=version+1 where id=target;
  end if; return target;
end $$;

create function public.issue_sale(target uuid,expected_version integer,request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sale public.sales; settings public.billing_settings; customer public.customers; vehicle public.vehicles; previous public.invoices; result uuid; number text; captured jsonb; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('sales.issue') or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
  if request is null then raise exception 'Request key required'; end if;
  select * into previous from public.invoices where request_key=request;
  if found then if previous.invoice_type<>'customer' or previous.sale_id<>target then raise exception 'Idempotency key reused'; end if; return previous.id; end if;
  select * into sale from public.sales where id=target for update;
  if sale.status<>'draft' or sale.version<>expected_version then raise exception 'Draft changed or already issued'; end if;
  select * into settings from public.billing_settings where id=1 and approved; if not found then raise exception 'Invoice settings are not approved'; end if;
  select * into customer from public.customers where id=sale.customer_id and not archived for share; if not found or coalesce(trim(customer.address),'')='' then raise exception 'Customer requires an active record and billing address'; end if;
  select * into vehicle from public.vehicles where id=sale.vehicle_id for update; if vehicle.status not in ('available','reserved') then raise exception 'Vehicle is not available'; end if;
  number:=public.next_invoice_number('customer');
  captured:=jsonb_build_object('company',to_jsonb(settings)-'id'-'approved'-'updated_at','customer',jsonb_build_object('full_name',customer.full_name,'address',customer.address,'email',customer.email,'phone',customer.phone),'vehicle',jsonb_build_object('registration',vehicle.registration,'vin',vehicle.vin,'make',vehicle.make,'model',vehicle.model,'model_year',vehicle.model_year,'mileage',vehicle.mileage),'list_price',sale.list_price,'discount',sale.discount,'fees',sale.fees,'fee_description',sale.fee_description,'total',sale.sale_price,'tax_mode','none','supply_date',(now() at time zone 'Europe/London')::date);
  update public.sales set status='issued',invoice_number=number,issued_at=now(),snapshot=captured,version=version+1 where id=target;
  update public.vehicles set status='sold',version=version+1,updated_at=now() where id=sale.vehicle_id;
  insert into public.invoices(sale_id,invoice_type,document_number,snapshot,total,issued_at,request_key,request_data) values(target,'customer',number,captured||jsonb_build_object('document_number',number,'invoice_type','customer','issued_at',now()),sale.sale_price,now(),request,jsonb_build_object('sale_id',target)) returning id into result;
  return result;
end $$;

create function public.cancel_sale_draft(target uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$ begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('sales.write') or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
  update public.sales set status='void',version=version+1 where id=target and status='draft' and version=expected_version;
  if not found then raise exception 'Cannot cancel an issued sale or stale draft'; end if;
end $$;

create function public.record_payment(target uuid,payment_amount numeric,payment_method text,payment_reference text,request uuid,refund_of uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.payments; original public.payments; result uuid; refunded numeric; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('payments.manage') or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
  if request is null or payment_amount is null or payment_amount<=0 or payment_amount>9999999999.99 or payment_amount<>round(payment_amount,2) or payment_method not in ('bank_transfer','cash','card','finance') or payment_method is null or char_length(coalesce(payment_reference,''))>120 then raise exception 'Invalid money amount'; end if;
  select * into prior from public.payments where request_key=request;
  if found then if prior.sale_id<>target or prior.amount<>payment_amount or prior.method<>payment_method or prior.reference<>coalesce(payment_reference,'') or prior.original_payment_id is distinct from refund_of then raise exception 'Idempotency key reused'; end if; return prior.id; end if;
  perform 1 from public.sales where id=target and status='issued' for update; if not found then raise exception 'Sale must be issued'; end if;
  if refund_of is null then
    if payment_amount>public.sale_balance(target) then raise exception 'Insufficient outstanding balance'; end if;
  else
    select * into original from public.payments where id=refund_of and sale_id=target and kind='receipt' for update;
    if not found then raise exception 'Original payment not found'; end if;
    select coalesce(sum(amount),0) into refunded from public.payments where original_payment_id=refund_of and kind='refund';
    if payment_amount>original.amount-refunded then raise exception 'Refund exceeds original payment'; end if;
  end if;
  insert into public.payments(sale_id,amount,method,reference,created_by,kind,original_payment_id,request_key) values(target,payment_amount,payment_method,coalesce(payment_reference,''),auth.uid(),case when refund_of is null then 'receipt' else 'refund' end,refund_of,request) returning id into result;
  return result;
end $$;

create function public.credit_sale(target uuid,credit_amount numeric,reason text,return_stock boolean,request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sale public.sales; original public.invoices; prior public.invoices; result uuid; number text; next_version integer; request_body jsonb; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('invoices.credit') or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
  if request is null or credit_amount is null or credit_amount<=0 or credit_amount<>round(credit_amount,2) or char_length(trim(coalesce(reason,''))) not between 1 and 500 or return_stock is null then raise exception 'Invalid credit details'; end if;
  request_body:=jsonb_build_object('amount',credit_amount,'reason',trim(reason),'return_stock',return_stock);
  select * into prior from public.invoices where request_key=request;
  if found then if prior.sale_id<>target or prior.invoice_type<>'credit' or prior.request_data<>request_body then raise exception 'Idempotency key reused'; end if; return prior.id; end if;
  select * into sale from public.sales where id=target for update; if sale.status<>'issued' then raise exception 'Sale must be issued'; end if;
  if credit_amount>sale.sale_price-sale.credited_amount then raise exception 'Credit exceeds invoice total'; end if;
  select * into original from public.invoices where sale_id=target and invoice_type='customer' and version=1;
  if not found or original.snapshot is null then raise exception 'Legacy invoice snapshot unavailable'; end if;
  if return_stock then
    if not public.has_permission('stock.write') or sale.credited_amount+credit_amount<>sale.sale_price then raise exception 'A full credit and stock permission are required for a return'; end if;
    if public.sale_balance(target)<>sale.sale_price-sale.credited_amount then raise exception 'Refund payments before returning stock'; end if;
    update public.vehicles set status='available',version=version+1,updated_at=now() where id=sale.vehicle_id;
  end if;
  number:=public.next_invoice_number('credit'); select coalesce(max(version),0)+1 into next_version from public.invoices where sale_id=target and invoice_type='credit';
  insert into public.invoices(sale_id,invoice_type,version,document_number,snapshot,total,issued_at,original_invoice_id,request_key,request_data) values(target,'credit',next_version,number,original.snapshot||jsonb_build_object('document_number',number,'invoice_type','credit','issued_at',now(),'total',credit_amount,'credit_reason',trim(reason),'original_number',original.document_number),credit_amount,now(),original.id,request,request_body) returning id into result;
  update public.sales set credited_amount=credited_amount+credit_amount,version=version+1 where id=target;
  return result;
end $$;

create function public.protect_invoice_snapshot() returns trigger language plpgsql set search_path='' as $$ begin
  if (to_jsonb(new)-'document_path'-'pdf_status') is distinct from (to_jsonb(old)-'document_path'-'pdf_status') then raise exception 'Issued invoices are immutable'; end if; return new;
end $$;
create trigger invoice_immutable before update on public.invoices for each row when(old.issued_at is not null) execute function public.protect_invoice_snapshot();
create function public.set_invoice_pdf(target uuid,pdf_state text) returns void language plpgsql security definer set search_path='' as $$
declare invoice public.invoices; begin
  select * into invoice from public.invoices where id=target;
  if not found or not public.can_access_sale(invoice.sale_id) or (invoice.invoice_type='finance' and not public.has_permission('finance.manage')) then raise exception 'Access denied' using errcode='42501'; end if;
  if pdf_state not in ('ready','failed') or pdf_state is null then raise exception 'Invalid PDF status'; end if;
  update public.invoices set pdf_status=pdf_state,document_path=case when pdf_state='ready' then invoice.sale_id::text||'/'||target::text||'.pdf' else document_path end where id=target;
end $$;
create trigger audit_sales after insert or update on public.sales for each row execute function public.audit_access_change();
create trigger audit_payments after insert on public.payments for each row execute function public.audit_access_change();
create trigger audit_invoices after insert on public.invoices for each row execute function public.audit_access_change();
create trigger audit_billing after insert or update on public.billing_settings for each row execute function public.audit_access_change();
drop policy invoices_read on public.invoices;
create policy invoices_read on public.invoices for select to authenticated using(public.can_access_sale(sale_id) and (invoice_type<>'finance' or public.has_permission('finance.manage')));
revoke all on function public.can_access_sale(uuid),public.sale_balance(uuid),public.save_billing_settings(jsonb),public.save_sale_draft(jsonb,integer),public.issue_sale(uuid,integer,uuid),public.cancel_sale_draft(uuid,integer),public.record_payment(uuid,numeric,text,text,uuid,uuid),public.credit_sale(uuid,numeric,text,boolean,uuid),public.set_invoice_pdf(uuid,text),public.protect_invoice_snapshot() from public,anon;
grant execute on function public.can_access_sale(uuid),public.sale_balance(uuid),public.save_billing_settings(jsonb),public.save_sale_draft(jsonb,integer),public.issue_sale(uuid,integer,uuid),public.cancel_sale_draft(uuid,integer),public.record_payment(uuid,numeric,text,text,uuid,uuid),public.credit_sale(uuid,numeric,text,boolean,uuid),public.set_invoice_pdf(uuid,text) to authenticated;
commit;
