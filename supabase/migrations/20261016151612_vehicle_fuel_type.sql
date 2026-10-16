begin;
alter table public.vehicles add column fuel_type text check(fuel_type in ('petrol','diesel','hybrid','diesel_hybrid','electric'));
create or replace function public.save_vehicle(payload jsonb,expected_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; previous public.vehicles; desired text; reg text; brand text; variant text; year_value integer; miles integer; asking numeric; transmission text; fuel text;
begin
  if not public.has_permission('stock.write') then raise exception 'Access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(8141402);
  desired:=coalesce(payload->>'status','available');target:=nullif(payload->>'id','')::uuid;
  reg:=nullif(upper(replace(trim(payload->>'registration'),' ','')),'');brand:=nullif(trim(payload->>'make'),'');variant:=nullif(trim(payload->>'model'),'');
  year_value:=nullif(payload->>'model_year','')::integer;miles:=nullif(payload->>'mileage','')::integer;
  fuel:=nullif(payload->>'fuel_type','');
  if fuel is not null and fuel not in ('petrol','diesel','hybrid','diesel_hybrid','electric') then raise exception 'Invalid fuel type';end if;
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
    insert into public.vehicles(registration,vin,make,model,model_year,mileage,status,purchase_date,asking_price,gearbox,fuel_type)
      values(reg,nullif(upper(trim(payload->>'vin')),''),brand,variant,year_value,miles,desired,nullif(payload->>'purchase_date','')::date,asking,transmission,fuel) returning id into target;
  else
    update public.vehicles set registration=reg,vin=nullif(upper(trim(payload->>'vin')),''),make=brand,model=variant,model_year=year_value,mileage=miles,status=desired,purchase_date=nullif(payload->>'purchase_date','')::date,asking_price=case when payload ? 'asking_price' then asking else previous.asking_price end,gearbox=case when payload ? 'gearbox' then transmission else previous.gearbox end,fuel_type=case when payload ? 'fuel_type' then fuel else previous.fuel_type end,version=version+1,updated_at=now() where id=target;
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
    target:=public.save_vehicle(jsonb_build_object('status','draft','registration',reg,'vin',chassis,'make',item->>'make','model',item->>'model','model_year',item->>'model_year','mileage',item->>'mileage','asking_price',item->>'asking_price','gearbox',item->>'gearbox','fuel_type',item->>'fuel_type'),0);
    update public.vehicles set autotrader_stock_id=source_id where id=target;
    added:=added+1;
  end loop;
  insert into public.audit_logs(actor_id,action,entity,after_data,reason) values(auth.uid(),'import_autotrader_drafts','vehicles',jsonb_build_object('imported',added,'skipped',skipped),'Staff confirmed authorized stock CSV; draft import only');
  return jsonb_build_object('imported',added,'skipped',skipped);
end $$;
commit;
