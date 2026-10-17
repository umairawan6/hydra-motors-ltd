begin;
alter table public.sales add column payment_method text check(payment_method in ('cash','card','bank_transfer'));
alter table public.billing_settings add column sale_terms text not null default 'TERMS & CONDITIONS OF SALE
1. Vehicle Condition: The vehicle is sold as a used vehicle, taking into account its age, mileage, price, condition and any defects specifically disclosed to and accepted by the buyer before purchase.
2. Inspection & Test Drive: The buyer is encouraged to inspect and test-drive the vehicle before purchase. Any known defects or agreed repairs should be recorded in writing on the sales invoice or accompanying documents.
3. Payment & Ownership: Full cleared payment must be received before the vehicle is released, unless otherwise agreed in writing. Ownership remains with Hydra Motors Ltd until payment has been received in full.
4. Deposits: Any deposit paid will be deducted from the final purchase price. Cancellation and refund arrangements will depend on the agreed terms and the buyer''s applicable statutory rights.
5. Vehicle Documentation: The buyer will receive the relevant vehicle documentation, keys and other items agreed as part of the sale. Any outstanding documents or agreed work must be recorded in writing.
6. Warranty: Any additional warranty supplied with the vehicle is subject to its separate written terms. A warranty does not replace or limit the buyer''s statutory consumer rights.
7. Statutory Rights: Where the buyer is a consumer, the vehicle must meet the requirements of the Consumer Rights Act 2015, including satisfactory quality, fitness for purpose and description. Nothing in these terms excludes or restricts the buyer''s statutory rights.
8. Complaints & After-Sales: Any concerns following purchase should be reported to Hydra Motors Ltd as soon as reasonably possible so they can be assessed and addressed in accordance with applicable law.
9. Vehicle Handover: The buyer acknowledges receipt of the vehicle, keys, documents and accessories listed in the handover record. Signing confirms receipt, not a waiver of statutory rights.
Hydra Motors Ltd
355 Bath Road, Slough, SL1 5PR
Tel: 07344 716719
Email: hydramotorsltd@gmail.com
Website: www.hydramotors.co.uk' check(char_length(trim(sale_terms)) between 1 and 10000);
update public.billing_settings set terms='Deposit credited towards purchase price. Balance payable as agreed. Any additional warranty is subject to its written terms. The buyer''s statutory consumer rights remain unaffected.' where id=1;
create or replace function public.save_billing_settings(payload jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
  perform pg_advisory_xact_lock(8141402);
  if payload ? 'sale_terms' and char_length(trim(coalesce(payload->>'sale_terms',''))) not between 1 and 10000 then raise exception 'Enter full sale terms (maximum 10000 characters)';end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and active and role='admin') then raise exception 'Access denied' using errcode='42501'; end if;
  if payload is null or char_length(trim(coalesce(payload->>'company_name',''))) not between 1 and 120
    or char_length(trim(coalesce(payload->>'address',''))) not between 1 and 1000
    or char_length(trim(coalesce(payload->>'registration_number',''))) not between 1 and 40
    or char_length(trim(coalesce(payload->>'terms',''))) not between 1 and 5000
    or char_length(coalesce(payload->>'email',''))>254 or char_length(coalesce(payload->>'phone',''))>40
    or char_length(coalesce(payload->>'payment_details',''))>1000
    or not coalesce((payload->>'approved')::boolean,false) then raise exception 'Confirm valid dealership details and invoice terms'; end if;
  insert into public.billing_settings(id,company_name,address,registration_number,email,phone,payment_details,terms,sale_terms,approved)
    values(1,trim(payload->>'company_name'),trim(payload->>'address'),trim(payload->>'registration_number'),coalesce(payload->>'email',''),coalesce(payload->>'phone',''),coalesce(payload->>'payment_details',''),trim(payload->>'terms'),coalesce(payload->>'sale_terms',(select sale_terms from public.billing_settings where id=1),'TERMS & CONDITIONS OF SALE
1. Vehicle Condition: The vehicle is sold as a used vehicle, taking into account its age, mileage, price, condition and any defects specifically disclosed to and accepted by the buyer before purchase.
2. Inspection & Test Drive: The buyer is encouraged to inspect and test-drive the vehicle before purchase. Any known defects or agreed repairs should be recorded in writing on the sales invoice or accompanying documents.
3. Payment & Ownership: Full cleared payment must be received before the vehicle is released, unless otherwise agreed in writing. Ownership remains with Hydra Motors Ltd until payment has been received in full.
4. Deposits: Any deposit paid will be deducted from the final purchase price. Cancellation and refund arrangements will depend on the agreed terms and the buyer''s applicable statutory rights.
5. Vehicle Documentation: The buyer will receive the relevant vehicle documentation, keys and other items agreed as part of the sale. Any outstanding documents or agreed work must be recorded in writing.
6. Warranty: Any additional warranty supplied with the vehicle is subject to its separate written terms. A warranty does not replace or limit the buyer''s statutory consumer rights.
7. Statutory Rights: Where the buyer is a consumer, the vehicle must meet the requirements of the Consumer Rights Act 2015, including satisfactory quality, fitness for purpose and description. Nothing in these terms excludes or restricts the buyer''s statutory rights.
8. Complaints & After-Sales: Any concerns following purchase should be reported to Hydra Motors Ltd as soon as reasonably possible so they can be assessed and addressed in accordance with applicable law.
9. Vehicle Handover: The buyer acknowledges receipt of the vehicle, keys, documents and accessories listed in the handover record. Signing confirms receipt, not a waiver of statutory rights.
Hydra Motors Ltd
355 Bath Road, Slough, SL1 5PR
Tel: 07344 716719
Email: hydramotorsltd@gmail.com
Website: www.hydramotors.co.uk'),true)
    on conflict(id) do update set company_name=excluded.company_name,address=excluded.address,registration_number=excluded.registration_number,email=excluded.email,phone=excluded.phone,payment_details=excluded.payment_details,terms=excluded.terms,sale_terms=excluded.sale_terms,approved=true,updated_at=now();
end $$;

create or replace function public.save_sale_draft(payload jsonb,expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; customer uuid; vehicle uuid; price numeric; discount_value numeric; fees_value numeric; existing public.sales; warranty integer; method text; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('sales.write') then raise exception 'Access denied' using errcode='42501'; end if;
  if coalesce(payload->>'warranty_months','') not in ('','3','6','12') then raise exception 'Invalid warranty duration'; end if;
  warranty:=nullif(payload->>'warranty_months','')::integer;
  method:=nullif(payload->>'payment_method','');if method is not null and method not in ('cash','card','bank_transfer') then raise exception 'Invalid invoice payment method';end if;
  target:=nullif(payload->>'id','')::uuid; customer:=(payload->>'customer_id')::uuid; vehicle:=(payload->>'vehicle_id')::uuid;
  price:=(payload->>'list_price')::numeric; discount_value:=coalesce((payload->>'discount')::numeric,0); fees_value:=coalesce((payload->>'fees')::numeric,0);
  if price is null or price<=0 or least(discount_value,fees_value)<0 or discount_value>price or price-discount_value+fees_value<=0 or price-discount_value+fees_value>9999999999.99
    or price<>round(price,2) or discount_value<>round(discount_value,2) or fees_value<>round(fees_value,2) or char_length(coalesce(payload->>'fee_description',''))>300 or (fees_value>0 and trim(coalesce(payload->>'fee_description',''))='') then raise exception 'Invalid money amount'; end if;
  if not exists(select 1 from public.customers where id=customer and not archived) then raise exception 'Choose an active customer'; end if;
  perform 1 from public.vehicles where id=vehicle and status in ('available','reserved') for update; if not found then raise exception 'Vehicle is not available'; end if;
  if target is null then
    insert into public.sales(customer_id,vehicle_id,sale_price,list_price,discount,fees,fee_description,warranty_months,payment_method,created_by) values(customer,vehicle,price-discount_value+fees_value,price,discount_value,fees_value,coalesce(payload->>'fee_description',''),warranty,method,auth.uid()) returning id into target;
  else
    select * into existing from public.sales where id=target for update;
    if not found or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
    if existing.status<>'draft' or existing.version<>expected_version then raise exception 'Draft changed. Refresh before saving'; end if;
    update public.sales set customer_id=customer,vehicle_id=vehicle,sale_price=price-discount_value+fees_value,list_price=price,discount=discount_value,fees=fees_value,fee_description=coalesce(payload->>'fee_description',''),warranty_months=warranty,payment_method=case when payload ? 'payment_method' then method else existing.payment_method end,version=version+1 where id=target;
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
  captured:=jsonb_build_object('company',to_jsonb(settings)-'id'-'approved'-'updated_at','customer',jsonb_build_object('full_name',customer.full_name,'address',customer.address,'email',customer.email,'phone',customer.phone),'vehicle',jsonb_build_object('registration',vehicle.registration,'vin',vehicle.vin,'make',vehicle.make,'model',vehicle.model,'model_year',vehicle.model_year,'mileage',vehicle.mileage,'gearbox',vehicle.gearbox),'payment_method',sale.payment_method,'warranty_months',sale.warranty_months,'list_price',sale.list_price,'discount',sale.discount,'fees',sale.fees,'fee_description',sale.fee_description,'total',sale.sale_price,'tax_mode','none','supply_date',(now() at time zone 'Europe/London')::date);
  update public.sales set status='issued',invoice_number=number,issued_at=now(),snapshot=captured,version=version+1 where id=target;
  update public.vehicles set status='sold',version=version+1,updated_at=now() where id=sale.vehicle_id;
  insert into public.invoices(sale_id,invoice_type,document_number,snapshot,total,issued_at,request_key,request_data) values(target,'customer',number,captured||jsonb_build_object('document_number',number,'invoice_type','customer','issued_at',now()),sale.sale_price,now(),request,jsonb_build_object('sale_id',target)) returning id into result;
  return result;
end $$;

commit;
