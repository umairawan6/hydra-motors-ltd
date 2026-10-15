begin;
alter table public.vehicles drop constraint vehicles_status_check;
alter table public.vehicles add constraint vehicles_status_check check(status in ('draft','available','reserved','sold','archived'));
alter table public.vehicles alter column registration drop not null;
alter table public.vehicles alter column make drop not null;
alter table public.vehicles alter column model drop not null;
-- Missing import fields are null, never fabricated registrations or placeholder specs.
alter table public.vehicles add constraint vehicles_operational_identity check(status in ('draft','archived') or
  (nullif(trim(registration),'') is not null and nullif(trim(make),'') is not null and nullif(trim(model),'') is not null)) not valid;

create or replace function public.save_vehicle(payload jsonb,expected_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; previous public.vehicles; desired text; reg text; brand text; variant text; year_value integer; miles integer;
begin
  if not public.has_permission('stock.write') then raise exception 'Access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(8141402);
  desired:=coalesce(payload->>'status','available');target:=nullif(payload->>'id','')::uuid;
  reg:=nullif(upper(replace(trim(payload->>'registration'),' ','')),'');brand:=nullif(trim(payload->>'make'),'');variant:=nullif(trim(payload->>'model'),'');
  year_value:=nullif(payload->>'model_year','')::integer;miles:=nullif(payload->>'mileage','')::integer;
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
    insert into public.vehicles(registration,vin,make,model,model_year,mileage,status,purchase_date)
      values(reg,nullif(upper(trim(payload->>'vin')),''),brand,variant,year_value,miles,desired,nullif(payload->>'purchase_date','')::date) returning id into target;
  else
    update public.vehicles set registration=reg,vin=nullif(upper(trim(payload->>'vin')),''),make=brand,model=variant,model_year=year_value,mileage=miles,status=desired,purchase_date=nullif(payload->>'purchase_date','')::date,version=version+1,updated_at=now() where id=target;
  end if;
  return target;
end $$;
-- Existing permissions, audit triggers, uniqueness and sale availability checks are retained.
commit;
