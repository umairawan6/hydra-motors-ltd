begin;
alter table public.vehicles add column asking_price numeric(12,2) check(asking_price>=0 and asking_price<=9999999999.99);
alter table public.vehicles add column gearbox text check(gearbox in ('automatic','manual'));
create or replace function public.save_vehicle(payload jsonb,expected_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; previous public.vehicles; desired text; reg text; brand text; variant text; year_value integer; miles integer; asking numeric; transmission text;
begin
  if not public.has_permission('stock.write') then raise exception 'Access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(8141402);
  desired:=coalesce(payload->>'status','available');target:=nullif(payload->>'id','')::uuid;
  reg:=nullif(upper(replace(trim(payload->>'registration'),' ','')),'');brand:=nullif(trim(payload->>'make'),'');variant:=nullif(trim(payload->>'model'),'');
  year_value:=nullif(payload->>'model_year','')::integer;miles:=nullif(payload->>'mileage','')::integer;
  asking:=nullif(payload->>'asking_price','')::numeric;transmission:=nullif(payload->>'gearbox','');
  if (asking is not null and (asking<0 or asking>9999999999.99 or asking<>round(asking,2) or asking::text in ('NaN','Infinity','-Infinity'))) or (transmission is not null and transmission not in ('automatic','manual')) then raise exception 'Invalid stock price or gearbox';end if;
  if payload is null or desired not in ('draft','available','reserved','sold','archived')
    or char_length(coalesce(reg,''))>20 or char_length(coalesce(brand,''))>80 or char_length(coalesce(variant,''))>120
    or char_length(coalesce(payload->>'vin',''))>40 or miles<0 or miles>999999999
    or (year_value is not null and year_value not between 1900 and 2100) then raise exception 'Invalid vehicle details';end if;
  if target is not null then
    select * into previous from public.vehicles where id=target for update;
    if not found or previous.version<>expected_version then raise exception 'Record changed. Refresh before saving';end if;
    if (previous.status='sold' or desired='sold') and desired<>previous.status then raise exception 'Use the invoice return workflow to change sold stock';end if;
  elsif desired='sold' then raise exception 'Only invoice issuance can mark stock sold';end if;
  if desired not in ('draft','archived') and (reg is null or brand is null or variant is null or year_value is null or miles is null) then
    raise exception 'Complete registration, make, model, year and mileage before marking a vehicle available.';end if;
  if target is null then
    insert into public.vehicles(registration,vin,make,model,model_year,mileage,status,purchase_date,asking_price,gearbox)
      values(reg,nullif(upper(trim(payload->>'vin')),''),brand,variant,year_value,miles,desired,nullif(payload->>'purchase_date','')::date,asking,transmission) returning id into target;
  else
    update public.vehicles set registration=reg,vin=nullif(upper(trim(payload->>'vin')),''),make=brand,model=variant,model_year=year_value,mileage=miles,status=desired,purchase_date=nullif(payload->>'purchase_date','')::date,asking_price=case when payload ? 'asking_price' then asking else previous.asking_price end,gearbox=case when payload ? 'gearbox' then transmission else previous.gearbox end,version=version+1,updated_at=now() where id=target;
  end if;
  return target;
end $$;
create or replace function public.import_autotrader_drafts(items jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; source_id text; reg text; chassis text; target uuid; added integer:=0; skipped integer:=0;
begin
  if auth.uid() is null or not public.has_permission('stock.read') or not public.has_permission('stock.write') then raise exception 'Access denied' using errcode='42501';end if;
  if items is null or jsonb_typeof(items)<>'array' then raise exception 'Invalid import';end if;
  if jsonb_array_length(items) not between 1 and 200 then raise exception 'Import 1 to 200 vehicles';end if;
  perform pg_advisory_xact_lock(8141402);
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item)<>'object' then raise exception 'Invalid vehicle row';end if;
    source_id:=nullif(trim(item->>'stock_id'),'');reg:=nullif(upper(replace(trim(item->>'registration'),' ','')),'');chassis:=nullif(upper(trim(item->>'vin')),'');
    if source_id is null and reg is null and chassis is null then raise exception 'Import row requires a stock ID, registration or VIN';end if;
    if source_id is not null and source_id !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'Invalid stock ID';end if;
    if exists(select 1 from public.vehicles where (source_id is not null and autotrader_stock_id=source_id)
      or (reg is not null and upper(replace(registration,' ',''))=reg) or (chassis is not null and upper(vin)=chassis)) then
      skipped:=skipped+1;continue;
    end if;
    -- Explicit projection prevents input from setting status, prices, permissions or an existing ID.
    target:=public.save_vehicle(jsonb_build_object('status','draft','registration',reg,'vin',chassis,'make',item->>'make','model',item->>'model','model_year',item->>'model_year','mileage',item->>'mileage','asking_price',item->>'asking_price','gearbox',item->>'gearbox'),0);
    update public.vehicles set autotrader_stock_id=source_id where id=target;
    added:=added+1;
  end loop;
  insert into public.audit_logs(actor_id,action,entity,after_data,reason) values(auth.uid(),'import_autotrader_drafts','vehicles',jsonb_build_object('imported',added,'skipped',skipped),'Staff confirmed authorized stock CSV; draft import only');
  return jsonb_build_object('imported',added,'skipped',skipped);
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
  captured:=jsonb_build_object('company',to_jsonb(settings)-'id'-'approved'-'updated_at','customer',jsonb_build_object('full_name',customer.full_name,'address',customer.address,'email',customer.email,'phone',customer.phone),'vehicle',jsonb_build_object('registration',vehicle.registration,'vin',vehicle.vin,'make',vehicle.make,'model',vehicle.model,'model_year',vehicle.model_year,'mileage',vehicle.mileage,'gearbox',vehicle.gearbox),'warranty_months',sale.warranty_months,'list_price',sale.list_price,'discount',sale.discount,'fees',sale.fees,'fee_description',sale.fee_description,'total',sale.sale_price,'tax_mode','none','supply_date',(now() at time zone 'Europe/London')::date);
  update public.sales set status='issued',invoice_number=number,issued_at=now(),snapshot=captured,version=version+1 where id=target;
  update public.vehicles set status='sold',version=version+1,updated_at=now() where id=sale.vehicle_id;
  insert into public.invoices(sale_id,invoice_type,document_number,snapshot,total,issued_at,request_key,request_data) values(target,'customer',number,captured||jsonb_build_object('document_number',number,'invoice_type','customer','issued_at',now()),sale.sale_price,now(),request,jsonb_build_object('sale_id',target)) returning id into result;
  return result;
end $$;

commit;
