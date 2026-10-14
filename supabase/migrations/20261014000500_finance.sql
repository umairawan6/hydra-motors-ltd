begin;
create table public.finance_providers(id uuid primary key default gen_random_uuid(),full_name text not null,address text not null,email text not null default '',phone text not null default '',archived boolean not null default false,version integer not null default 1,created_at timestamptz not null default now());
create table public.finance_invoices(id uuid primary key references public.invoices(id),sale_id uuid not null references public.sales(id),provider_id uuid not null references public.finance_providers(id),due_date date not null,total numeric(12,2) not null check(total>0),status text not null default 'open' check(status in ('open','void')),void_reason text,created_at timestamptz not null default now());
create table public.finance_settlements(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.finance_invoices(id),payment_id uuid not null unique references public.payments(id),created_at timestamptz not null default now());
create table public.supplier_invoices(id uuid primary key default gen_random_uuid(),supplier_name text not null,supplier_address text not null default '',supplier_reference text not null,total numeric(12,2) not null check(total>0),invoice_date date not null,due_date date not null,description text not null,vehicle_id uuid references public.vehicles(id),cost_treatment text not null check(cost_treatment in ('additional','included_in_base','overhead')),status text not null default 'open' check(status in ('open','void')),void_reason text,request_key uuid not null unique,request_data jsonb not null,created_at timestamptz not null default now(),check((vehicle_id is null and cost_treatment='overhead') or (vehicle_id is not null and cost_treatment in ('additional','included_in_base'))));
create unique index supplier_reference_unique on public.supplier_invoices(lower(supplier_name),lower(supplier_reference));
create table public.supplier_payments(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references public.supplier_invoices(id),amount numeric(12,2) not null check(amount>0),method text not null,reference text not null default '',kind text not null default 'payment' check(kind in ('payment','refund')),original_payment_id uuid references public.supplier_payments(id),request_key uuid not null unique,created_by uuid not null references auth.users(id),received_at timestamptz not null default now());
create table public.supplier_documents(id uuid primary key,invoice_id uuid not null references public.supplier_invoices(id),path text not null unique,ready boolean not null default false,created_at timestamptz not null default now(),check(path=invoice_id::text||'/'||id::text||'.pdf' or path=invoice_id::text||'/'||id::text||'.jpg' or path=invoice_id::text||'/'||id::text||'.png' or path=invoice_id::text||'/'||id::text||'.webp'));
create index finance_due_idx on public.finance_invoices(status,due_date);
create index supplier_due_idx on public.supplier_invoices(status,due_date);

create function public.can_access_supplier(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.has_permission('finance.manage') and exists(select 1 from public.supplier_invoices where id=target and (vehicle_id is null or public.has_permission('costs.read'))) $$;
create function public.finance_balance(target uuid) returns numeric language plpgsql stable security definer set search_path='' as $$
declare invoice public.finance_invoices; paid numeric; begin
  select * into invoice from public.finance_invoices where id=target;
  if not found or not public.has_permission('finance.manage') or not public.can_access_sale(invoice.sale_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select coalesce(sum(p.amount-coalesce((select sum(r.amount) from public.payments r where r.original_payment_id=p.id and r.kind='refund'),0)),0) into paid from public.finance_settlements fs join public.payments p on p.id=fs.payment_id where fs.invoice_id=target;
  return invoice.total-paid;
end $$;
create function public.supplier_balance(target uuid) returns numeric language plpgsql stable security definer set search_path='' as $$ begin
  if not public.can_access_supplier(target) then raise exception 'Access denied' using errcode='42501'; end if;
  return (select total-coalesce((select sum(case when p.kind='payment' then p.amount else -p.amount end) from public.supplier_payments p where p.invoice_id=target),0) from public.supplier_invoices where id=target);
end $$;
create function public.vehicle_expense_total(target uuid) returns numeric language plpgsql stable security definer set search_path='' as $$ begin
  if not public.has_permission('costs.read') then raise exception 'Access denied' using errcode='42501'; end if;
  return (select coalesce(sum(total),0) from public.supplier_invoices where vehicle_id=target and cost_treatment='additional' and status='open');
end $$;

create function public.save_finance_provider(payload jsonb,expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; begin
  if not public.has_permission('finance.manage') then raise exception 'Access denied' using errcode='42501'; end if;
  if payload is null or char_length(trim(coalesce(payload->>'full_name',''))) not between 1 and 120 or char_length(trim(coalesce(payload->>'address',''))) not between 1 and 1000 or char_length(coalesce(payload->>'email',''))>254 or char_length(coalesce(payload->>'phone',''))>40 then raise exception 'Invalid provider details'; end if;
  target:=nullif(payload->>'id','')::uuid;
  if target is null then insert into public.finance_providers(full_name,address,email,phone) values(trim(payload->>'full_name'),trim(payload->>'address'),coalesce(payload->>'email',''),coalesce(payload->>'phone','')) returning id into target;
  else update public.finance_providers set full_name=trim(payload->>'full_name'),address=trim(payload->>'address'),email=coalesce(payload->>'email',''),phone=coalesce(payload->>'phone',''),archived=coalesce((payload->>'archived')::boolean,false),version=version+1 where id=target and version=expected_version; if not found then raise exception 'Record changed. Refresh before saving'; end if; end if; return target;
end $$;

create function public.create_finance_invoice(target_sale uuid,target_provider uuid,invoice_amount numeric,due date,request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare source public.invoices; provider public.finance_providers; previous public.invoices; result uuid; number text; next_version integer; reserved numeric; request_body jsonb; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('finance.manage') or not public.can_access_sale(target_sale) then raise exception 'Access denied' using errcode='42501'; end if;
  if request is null or invoice_amount is null or invoice_amount<=0 or invoice_amount<>round(invoice_amount,2) or due is null then raise exception 'Invalid finance invoice details'; end if;
  request_body:=jsonb_build_object('provider',target_provider,'amount',invoice_amount,'due',due);
  select * into previous from public.invoices where request_key=request;
  if found then if previous.sale_id<>target_sale or previous.invoice_type<>'finance' or previous.request_data<>request_body then raise exception 'Idempotency key reused'; end if; return previous.id; end if;
  select * into source from public.invoices where sale_id=target_sale and invoice_type='customer' and version=1;
  if not found or source.snapshot is null then raise exception 'Sale must have an issued snapshot'; end if;
  select * into provider from public.finance_providers where id=target_provider and not archived for share; if not found then raise exception 'Choose an active finance provider'; end if;
  select coalesce(sum(public.finance_balance(id)),0) into reserved from public.finance_invoices where sale_id=target_sale and status='open';
  if invoice_amount>public.sale_balance(target_sale)-reserved then raise exception 'Insufficient outstanding balance'; end if;
  number:=public.next_invoice_number('finance');select coalesce(max(version),0)+1 into next_version from public.invoices where sale_id=target_sale and invoice_type='finance';
  insert into public.invoices(sale_id,invoice_type,version,document_number,total,issued_at,request_key,request_data,snapshot) values(target_sale,'finance',next_version,number,invoice_amount,now(),request,request_body,source.snapshot||jsonb_build_object('invoice_type','finance','document_number',number,'issued_at',now(),'total',invoice_amount,'provider',jsonb_build_object('full_name',provider.full_name,'address',provider.address,'email',provider.email,'phone',provider.phone),'source_number',source.document_number,'due_date',due)) returning id into result;
  insert into public.finance_invoices(id,sale_id,provider_id,due_date,total) values(result,target_sale,target_provider,due,invoice_amount);
  return result;
end $$;

create function public.settle_finance_invoice(target uuid,settlement_amount numeric,settlement_reference text,request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare invoice public.finance_invoices; existing public.payments; payment uuid; begin
  perform pg_advisory_xact_lock(8141402);
  select * into invoice from public.finance_invoices where id=target for update;
  if not found or not public.has_permission('finance.manage') or not public.has_permission('payments.manage') or not public.can_access_sale(invoice.sale_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select p.* into existing from public.finance_settlements f join public.payments p on p.id=f.payment_id where f.invoice_id=target and p.request_key=request;
  if found then if existing.amount<>settlement_amount or existing.reference<>coalesce(settlement_reference,'') then raise exception 'Idempotency key reused'; end if; return existing.id; end if;
  if invoice.status<>'open' or settlement_amount>public.finance_balance(target) then raise exception 'Insufficient outstanding balance'; end if;
  if char_length(trim(coalesce(settlement_reference,''))) not between 1 and 120 then raise exception 'Settlement reference required'; end if;
  if exists(select 1 from public.finance_settlements f join public.payments p on p.id=f.payment_id where f.invoice_id=target and p.reference=trim(settlement_reference)) then raise exception 'Duplicate settlement reference'; end if;
  payment:=public.record_payment(invoice.sale_id,settlement_amount,'finance',trim(settlement_reference),request,null);
  insert into public.finance_settlements(invoice_id,payment_id) values(target,payment);return payment;
end $$;

create function public.create_supplier_invoice(payload jsonb,request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; previous public.supplier_invoices; amount numeric; vehicle uuid; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('finance.manage') then raise exception 'Access denied' using errcode='42501'; end if;
  if request is null or payload is null then raise exception 'Invalid supplier invoice'; end if;
  select * into previous from public.supplier_invoices where request_key=request;
  if found then if not public.can_access_supplier(previous.id) or previous.request_data<>payload then raise exception 'Idempotency key reused'; end if;return previous.id;end if;
  amount:=(payload->>'total')::numeric;vehicle:=nullif(payload->>'vehicle_id','')::uuid;
  if amount is null or amount<=0 or amount>9999999999.99 or amount<>round(amount,2) or char_length(trim(coalesce(payload->>'supplier_name',''))) not between 1 and 120 or char_length(trim(coalesce(payload->>'supplier_reference',''))) not between 1 and 120 or char_length(trim(coalesce(payload->>'description',''))) not between 1 and 1000 or char_length(coalesce(payload->>'supplier_address',''))>1000 or nullif(payload->>'invoice_date','') is null or nullif(payload->>'due_date','') is null then raise exception 'Invalid supplier invoice'; end if;
  if vehicle is not null and not public.has_permission('costs.write') then raise exception 'Access denied' using errcode='42501'; end if;
  insert into public.supplier_invoices(supplier_name,supplier_address,supplier_reference,total,invoice_date,due_date,description,vehicle_id,cost_treatment,request_key,request_data) values(trim(payload->>'supplier_name'),coalesce(payload->>'supplier_address',''),trim(payload->>'supplier_reference'),amount,(payload->>'invoice_date')::date,(payload->>'due_date')::date,trim(payload->>'description'),vehicle,payload->>'cost_treatment',request,payload) returning id into result;return result;
end $$;

create function public.record_supplier_payment(target uuid,payment_amount numeric,payment_method text,payment_reference text,request uuid,refund_of uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.supplier_payments; original public.supplier_payments; result uuid; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('payments.manage') or not public.can_access_supplier(target) then raise exception 'Access denied' using errcode='42501'; end if;
  if request is null or payment_amount is null or payment_amount<=0 or payment_amount<>round(payment_amount,2) or payment_method not in ('bank_transfer','cash','card') or payment_method is null or char_length(coalesce(payment_reference,''))>120 then raise exception 'Invalid money amount'; end if;
  select * into previous from public.supplier_payments where request_key=request;
  if found then if previous.invoice_id<>target or previous.amount<>payment_amount or previous.method<>payment_method or previous.reference<>coalesce(payment_reference,'') or previous.original_payment_id is distinct from refund_of then raise exception 'Idempotency key reused'; end if;return previous.id;end if;
  perform 1 from public.supplier_invoices where id=target and status='open' for update; if not found then raise exception 'Invoice is void'; end if;
  if refund_of is null then if payment_amount>public.supplier_balance(target) then raise exception 'Insufficient outstanding balance'; end if;
  else select * into original from public.supplier_payments where id=refund_of and invoice_id=target and kind='payment';if not found or payment_amount>original.amount-coalesce((select sum(amount) from public.supplier_payments where original_payment_id=refund_of),0) then raise exception 'Refund exceeds original payment';end if;end if;
  insert into public.supplier_payments(invoice_id,amount,method,reference,kind,original_payment_id,request_key,created_by) values(target,payment_amount,payment_method,coalesce(payment_reference,''),case when refund_of is null then 'payment' else 'refund' end,refund_of,request,auth.uid()) returning id into result;return result;
end $$;

create function public.void_financial_invoice(target uuid,invoice_kind text,reason text) returns void language plpgsql security definer set search_path='' as $$
declare finance public.finance_invoices; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('finance.manage') or char_length(trim(coalesce(reason,''))) not between 1 and 500 then raise exception 'Access denied or missing reason';end if;
  if invoice_kind='finance' then select * into finance from public.finance_invoices where id=target for update;if not found or not public.can_access_sale(finance.sale_id) or public.finance_balance(target)<>finance.total then raise exception 'Refund payments before voiding the invoice';end if;update public.finance_invoices set status='void',void_reason=trim(reason) where id=target;
  elsif invoice_kind='supplier' then if not public.can_access_supplier(target) or public.supplier_balance(target)<>(select total from public.supplier_invoices where id=target) then raise exception 'Refund payments before voiding the invoice';end if;update public.supplier_invoices set status='void',void_reason=trim(reason) where id=target;
  else raise exception 'Unknown invoice kind';end if;
end $$;

alter table public.finance_providers enable row level security;
alter table public.finance_invoices enable row level security;
alter table public.finance_settlements enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.supplier_documents enable row level security;
grant select on public.finance_providers,public.finance_invoices,public.finance_settlements,public.supplier_invoices,public.supplier_payments,public.supplier_documents to authenticated;
revoke all on public.finance_providers,public.finance_invoices,public.finance_settlements,public.supplier_invoices,public.supplier_payments,public.supplier_documents from anon;
revoke insert,update,delete on public.finance_providers,public.finance_invoices,public.finance_settlements,public.supplier_invoices,public.supplier_payments from authenticated;
grant insert,update,delete on public.supplier_documents to authenticated;
create policy providers_read on public.finance_providers for select to authenticated using(public.has_permission('finance.manage'));
create policy finance_read on public.finance_invoices for select to authenticated using(public.has_permission('finance.manage') and public.can_access_sale(sale_id));
create policy settlements_read on public.finance_settlements for select to authenticated using(exists(select 1 from public.finance_invoices f where f.id=invoice_id));
create policy suppliers_read on public.supplier_invoices for select to authenticated using(public.has_permission('finance.manage') and (vehicle_id is null or public.has_permission('costs.read')));
create policy supplier_payments_read on public.supplier_payments for select to authenticated using(public.can_access_supplier(invoice_id));
create policy supplier_docs_read on public.supplier_documents for select to authenticated using(public.can_access_supplier(invoice_id));
create policy supplier_docs_insert on public.supplier_documents for insert to authenticated with check(public.can_access_supplier(invoice_id) and not ready);
create policy supplier_docs_update on public.supplier_documents for update to authenticated using(public.can_access_supplier(invoice_id)) with check(public.can_access_supplier(invoice_id));
create policy supplier_docs_cleanup on public.supplier_documents for delete to authenticated using(public.can_access_supplier(invoice_id) and not ready);

create view public.finance_invoice_summary with(security_invoker=true) as select f.*,i.document_number,public.finance_balance(f.id) balance from public.finance_invoices f join public.invoices i on i.id=f.id;
create view public.supplier_invoice_summary with(security_invoker=true) as select s.*,public.supplier_balance(s.id) balance from public.supplier_invoices s;
grant select on public.finance_invoice_summary,public.supplier_invoice_summary to authenticated;
revoke all on public.finance_invoice_summary,public.supplier_invoice_summary from anon;
create trigger audit_providers after insert or update on public.finance_providers for each row execute function public.audit_access_change();
create trigger audit_finance after insert or update on public.finance_invoices for each row execute function public.audit_access_change();
create trigger audit_settlements after insert on public.finance_settlements for each row execute function public.audit_access_change();
create trigger audit_suppliers after insert or update on public.supplier_invoices for each row execute function public.audit_access_change();
create trigger audit_supplier_payments after insert on public.supplier_payments for each row execute function public.audit_access_change();
drop policy audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using(public.has_permission('audit.read') and
  (entity<>'vehicle_costs' or public.has_permission('costs.read')) and
  (entity not in ('supplier_invoices','supplier_payments') or (public.has_permission('finance.manage') and public.has_permission('costs.read'))) and
  (entity not in ('finance_providers','finance_invoices','finance_settlements') or public.has_permission('finance.manage')) and
  (entity<>'invoices' or coalesce(after_data->>'invoice_type','')<>'finance' or public.has_permission('finance.manage')));
revoke all on function public.can_access_supplier(uuid),public.finance_balance(uuid),public.supplier_balance(uuid),public.vehicle_expense_total(uuid),public.save_finance_provider(jsonb,integer),public.create_finance_invoice(uuid,uuid,numeric,date,uuid),public.settle_finance_invoice(uuid,numeric,text,uuid),public.create_supplier_invoice(jsonb,uuid),public.record_supplier_payment(uuid,numeric,text,text,uuid,uuid),public.void_financial_invoice(uuid,text,text) from public,anon;
grant execute on function public.can_access_supplier(uuid),public.finance_balance(uuid),public.supplier_balance(uuid),public.vehicle_expense_total(uuid),public.save_finance_provider(jsonb,integer),public.create_finance_invoice(uuid,uuid,numeric,date,uuid),public.settle_finance_invoice(uuid,numeric,text,uuid),public.create_supplier_invoice(jsonb,uuid),public.record_supplier_payment(uuid,numeric,text,text,uuid,uuid),public.void_financial_invoice(uuid,text,text) to authenticated;
commit;
