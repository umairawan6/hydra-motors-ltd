begin;
alter table public.customers add column archived boolean not null default false;
alter table public.customers add column version integer not null default 1;
alter table public.customers add column updated_at timestamptz not null default now();
alter table public.vehicles add column status text not null default 'available' check(status in ('available','reserved','sold','archived'));
alter table public.vehicles add column purchase_date date;
alter table public.vehicles add column version integer not null default 1;
alter table public.vehicles add column updated_at timestamptz not null default now();
update public.vehicles v set status='sold' where exists(select 1 from public.sales s where s.vehicle_id=v.id and s.status='issued');
alter table public.vehicle_costs add column version integer not null default 1;
create unique index vehicles_registration_normalized on public.vehicles(upper(replace(registration,' ','')));
create unique index vehicles_vin_normalized on public.vehicles(upper(vin)) where vin is not null and vin<>'';
create index vehicles_status_created on public.vehicles(status,created_at desc);
create index customers_name_idx on public.customers(lower(full_name));
create table public.vehicle_photos (
  id uuid primary key, vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  path text not null unique, ready boolean not null default false,
  created_at timestamptz not null default now(),
  check(path=vehicle_id::text||'/'||id::text||'.jpg' or path=vehicle_id::text||'/'||id::text||'.png' or path=vehicle_id::text||'/'||id::text||'.webp')
);
alter table public.vehicle_photos enable row level security;
grant select,insert,update,delete on public.vehicle_photos to authenticated;
revoke all on public.vehicle_photos from anon;
create policy photos_read on public.vehicle_photos for select to authenticated using(public.has_permission('stock.read'));
create policy photos_insert on public.vehicle_photos for insert to authenticated with check(public.has_permission('stock.write') and not ready);
create policy photos_update on public.vehicle_photos for update to authenticated using(public.has_permission('stock.write')) with check(public.has_permission('stock.write'));
create policy photos_cleanup on public.vehicle_photos for delete to authenticated using(public.has_permission('stock.write') and not ready);
revoke insert,update,delete on public.customers,public.vehicles,public.vehicle_costs from authenticated;

create function public.save_customer(payload jsonb, expected_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; begin
  if not public.has_permission('customers.write') then raise exception 'Access denied' using errcode='42501'; end if;
  if payload is null or char_length(trim(coalesce(payload->>'full_name',''))) not between 1 and 120
    or char_length(coalesce(payload->>'email',''))>254 or char_length(coalesce(payload->>'phone',''))>40
    or char_length(coalesce(payload->>'address',''))>1000 then raise exception 'Invalid customer details'; end if;
  target:=nullif(payload->>'id','')::uuid;
  if target is null then
    insert into public.customers(full_name,email,phone,address) values(trim(payload->>'full_name'),nullif(trim(payload->>'email'),''),nullif(trim(payload->>'phone'),''),nullif(trim(payload->>'address'),'')) returning id into target;
  else
    update public.customers set full_name=trim(payload->>'full_name'),email=nullif(trim(payload->>'email'),''),phone=nullif(trim(payload->>'phone'),''),address=nullif(trim(payload->>'address'),''),archived=coalesce((payload->>'archived')::boolean,false),version=version+1,updated_at=now()
      where id=target and version=expected_version;
    if not found then raise exception 'Record changed. Refresh before saving'; end if;
  end if;
  return target;
end $$;

create function public.save_vehicle(payload jsonb, expected_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid; previous public.vehicles; desired text; begin
  if not public.has_permission('stock.write') then raise exception 'Access denied' using errcode='42501'; end if;
  desired:=coalesce(payload->>'status','available');
  if payload is null or desired not in ('available','reserved','sold','archived')
    or char_length(replace(trim(coalesce(payload->>'registration','')),' ','')) not between 1 and 20
    or char_length(trim(coalesce(payload->>'make',''))) not between 1 and 80
    or char_length(trim(coalesce(payload->>'model',''))) not between 1 and 120
    or char_length(coalesce(payload->>'vin',''))>40
    or coalesce((payload->>'mileage')::integer,0)<0
    or (nullif(payload->>'model_year','')::integer is not null and nullif(payload->>'model_year','')::integer not between 1900 and 2100)
    then raise exception 'Invalid vehicle details'; end if;
  target:=nullif(payload->>'id','')::uuid;
  if target is null then
    if desired='sold' then raise exception 'Only invoice issuance can mark stock sold'; end if;
    insert into public.vehicles(registration,vin,make,model,model_year,mileage,status,purchase_date)
      values(upper(replace(trim(payload->>'registration'),' ','')),nullif(upper(trim(payload->>'vin')),''),trim(payload->>'make'),trim(payload->>'model'),nullif(payload->>'model_year','')::integer,nullif(payload->>'mileage','')::integer,desired,nullif(payload->>'purchase_date','')::date) returning id into target;
  else
    select * into previous from public.vehicles where id=target for update;
    if not found or previous.version<>expected_version then raise exception 'Record changed. Refresh before saving'; end if;
    if (previous.status='sold' or desired='sold') and desired<>previous.status then raise exception 'Use the invoice return workflow to change sold stock'; end if;
    update public.vehicles set registration=upper(replace(trim(payload->>'registration'),' ','')),vin=nullif(upper(trim(payload->>'vin')),''),make=trim(payload->>'make'),model=trim(payload->>'model'),model_year=nullif(payload->>'model_year','')::integer,mileage=nullif(payload->>'mileage','')::integer,status=desired,purchase_date=nullif(payload->>'purchase_date','')::date,version=version+1,updated_at=now() where id=target;
  end if;
  return target;
end $$;

create function public.save_vehicle_costs(target_vehicle uuid, purchase numeric, preparation numeric, other numeric, expected_version integer) returns void
language plpgsql security definer set search_path='' as $$ begin
  if not public.has_permission('costs.write') then raise exception 'Access denied' using errcode='42501'; end if;
  if purchase is null or preparation is null or other is null or least(purchase,preparation,other)<0
    or greatest(purchase,preparation,other)>9999999999.99 or purchase<>round(purchase,2) or preparation<>round(preparation,2) or other<>round(other,2) then raise exception 'Invalid money amount'; end if;
  perform 1 from public.vehicles where id=target_vehicle for update;
  if not found then raise exception 'Vehicle not found'; end if;
  if exists(select 1 from public.vehicle_costs where vehicle_id=target_vehicle) then
    update public.vehicle_costs set purchase_cost=purchase,preparation_cost=preparation,other_cost=other,version=version+1,updated_at=now() where vehicle_id=target_vehicle and version=expected_version;
    if not found then raise exception 'Record changed. Refresh before saving'; end if;
  else
    if expected_version<>0 then raise exception 'Record changed. Refresh before saving'; end if;
    insert into public.vehicle_costs(vehicle_id,purchase_cost,preparation_cost,other_cost) values(target_vehicle,purchase,preparation,other);
  end if;
end $$;

create trigger audit_customers after insert or update on public.customers for each row execute function public.audit_access_change();
create trigger audit_vehicles after insert or update on public.vehicles for each row execute function public.audit_access_change();
create trigger audit_costs after insert or update on public.vehicle_costs for each row execute function public.audit_access_change();
-- Audit snapshots contain costs; only audit.read can access them.
revoke all on function public.save_customer(jsonb,integer), public.save_vehicle(jsonb,integer), public.save_vehicle_costs(uuid,numeric,numeric,numeric,integer) from public,anon;
grant execute on function public.save_customer(jsonb,integer), public.save_vehicle(jsonb,integer), public.save_vehicle_costs(uuid,numeric,numeric,numeric,integer) to authenticated;
commit;
