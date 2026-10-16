begin;
alter table public.sales add column warranty_months integer check(warranty_months in (3,6,12));
create or replace function public.save_sale_draft(payload jsonb,expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; customer uuid; vehicle uuid; price numeric; discount_value numeric; fees_value numeric; existing public.sales; warranty integer; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('sales.write') then raise exception 'Access denied' using errcode='42501'; end if;
  if coalesce(payload->>'warranty_months','') not in ('','3','6','12') then raise exception 'Invalid warranty duration'; end if;
  warranty:=nullif(payload->>'warranty_months','')::integer;
  target:=nullif(payload->>'id','')::uuid; customer:=(payload->>'customer_id')::uuid; vehicle:=(payload->>'vehicle_id')::uuid;
  price:=(payload->>'list_price')::numeric; discount_value:=coalesce((payload->>'discount')::numeric,0); fees_value:=coalesce((payload->>'fees')::numeric,0);
  if price is null or price<=0 or least(discount_value,fees_value)<0 or discount_value>price or price-discount_value+fees_value<=0 or price-discount_value+fees_value>9999999999.99
    or price<>round(price,2) or discount_value<>round(discount_value,2) or fees_value<>round(fees_value,2) or char_length(coalesce(payload->>'fee_description',''))>300 or (fees_value>0 and trim(coalesce(payload->>'fee_description',''))='') then raise exception 'Invalid money amount'; end if;
  if not exists(select 1 from public.customers where id=customer and not archived) then raise exception 'Choose an active customer'; end if;
  perform 1 from public.vehicles where id=vehicle and status in ('available','reserved') for update; if not found then raise exception 'Vehicle is not available'; end if;
  if target is null then
    insert into public.sales(customer_id,vehicle_id,sale_price,list_price,discount,fees,fee_description,warranty_months,created_by) values(customer,vehicle,price-discount_value+fees_value,price,discount_value,fees_value,coalesce(payload->>'fee_description',''),warranty,auth.uid()) returning id into target;
  else
    select * into existing from public.sales where id=target for update;
    if not found or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
    if existing.status<>'draft' or existing.version<>expected_version then raise exception 'Draft changed. Refresh before saving'; end if;
    update public.sales set customer_id=customer,vehicle_id=vehicle,sale_price=price-discount_value+fees_value,list_price=price,discount=discount_value,fees=fees_value,fee_description=coalesce(payload->>'fee_description',''),warranty_months=warranty,version=version+1 where id=target;
  end if; return target;
end $$;

create or replace function public.issue_sale(target uuid,expected_version integer,request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sale public.sales; settings public.billing_settings; customer public.customers; vehicle public.vehicles; previous public.invoices; result uuid; number text; captured jsonb; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('sales.issue') or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
  if request is null then raise exception 'Request key required'; end if;
  select * into previous from public.invoices where request_key=request;
  if found then if previous.invoice_type<>'customer' or previous.sale_id<>target then raise exception 'Idempotency key reused'; end if; return previous.id; end if;
  select * into sale from public.sales where id=target for update;
  if sale.status<>'draft' or sale.version<>expected_version then raise exception 'Draft changed or already issued'; end if;
  if sale.sale_price<=0 or sale.sale_price<>sale.list_price-sale.discount+sale.fees then raise exception 'Invalid money amount'; end if;
  select * into settings from public.billing_settings where id=1 and approved; if not found then raise exception 'Invoice settings are not approved'; end if;
  select * into customer from public.customers where id=sale.customer_id and not archived for share; if not found or coalesce(trim(customer.address),'')='' then raise exception 'Customer requires an active record and billing address'; end if;
  select * into vehicle from public.vehicles where id=sale.vehicle_id for update; if vehicle.status not in ('available','reserved') then raise exception 'Vehicle is not available'; end if;
  number:=public.next_invoice_number('customer');
  captured:=jsonb_build_object('company',to_jsonb(settings)-'id'-'approved'-'updated_at','customer',jsonb_build_object('full_name',customer.full_name,'address',customer.address,'email',customer.email,'phone',customer.phone),'vehicle',jsonb_build_object('registration',vehicle.registration,'vin',vehicle.vin,'make',vehicle.make,'model',vehicle.model,'model_year',vehicle.model_year,'mileage',vehicle.mileage),'warranty_months',sale.warranty_months,'list_price',sale.list_price,'discount',sale.discount,'fees',sale.fees,'fee_description',sale.fee_description,'total',sale.sale_price,'tax_mode','none','supply_date',(now() at time zone 'Europe/London')::date);
  update public.sales set status='issued',invoice_number=number,issued_at=now(),snapshot=captured,version=version+1 where id=target;
  update public.vehicles set status='sold',version=version+1,updated_at=now() where id=sale.vehicle_id;
  insert into public.invoices(sale_id,invoice_type,document_number,snapshot,total,issued_at,request_key,request_data) values(target,'customer',number,captured||jsonb_build_object('document_number',number,'invoice_type','customer','issued_at',now()),sale.sale_price,now(),request,jsonb_build_object('sale_id',target)) returning id into result;
  return result;
end $$;

commit;
