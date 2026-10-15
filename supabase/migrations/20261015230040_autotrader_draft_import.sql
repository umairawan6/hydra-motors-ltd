begin;
alter table public.vehicles add column autotrader_stock_id text;
alter table public.vehicles add constraint vehicles_autotrader_stock_id_check check(autotrader_stock_id is null or autotrader_stock_id ~ '^[A-Za-z0-9_-]{1,100}$');
create unique index vehicles_autotrader_stock_id_unique on public.vehicles(autotrader_stock_id) where autotrader_stock_id is not null;
create function public.import_autotrader_drafts(items jsonb) returns jsonb
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
    target:=public.save_vehicle(jsonb_build_object('status','draft','registration',reg,'vin',chassis,'make',item->>'make','model',item->>'model','model_year',item->>'model_year','mileage',item->>'mileage'),0);
    update public.vehicles set autotrader_stock_id=source_id where id=target;
    added:=added+1;
  end loop;
  insert into public.audit_logs(actor_id,action,entity,after_data,reason) values(auth.uid(),'import_autotrader_drafts','vehicles',jsonb_build_object('imported',added,'skipped',skipped),'Staff confirmed authorized stock CSV; draft import only');
  return jsonb_build_object('imported',added,'skipped',skipped);
end $$;
revoke all on function public.import_autotrader_drafts(jsonb) from public,anon;
grant execute on function public.import_autotrader_drafts(jsonb) to authenticated;
commit;
