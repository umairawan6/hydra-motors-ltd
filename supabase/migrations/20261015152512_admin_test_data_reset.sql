begin;
-- Two independent gates: this database switch and a server-only environment flag.
create table public.test_reset_control(id integer primary key check(id=1),enabled boolean not null default false);
insert into public.test_reset_control(id) values(1);
create table public.test_reset_jobs(
  id uuid primary key,actor_id uuid not null references auth.users(id),
  counts jsonb not null,assets jsonb not null,created_at timestamptz not null default now(),completed_at timestamptz
);
create unique index one_pending_test_reset on public.test_reset_jobs((true)) where completed_at is null;
alter table public.test_reset_control enable row level security;
alter table public.test_reset_jobs enable row level security;
revoke all on public.test_reset_control,public.test_reset_jobs from public,anon,authenticated;
grant select,update on public.test_reset_control to service_role;
grant select on public.test_reset_jobs to service_role;

-- Ready assets remain immutable except inside the owner-executed, gated reset transaction.
create or replace function public.protect_ready_asset() returns trigger language plpgsql set search_path='' as $$ begin
  if old.ready then
    if TG_OP<>'DELETE' or current_user<>(select pg_get_userbyid(relowner) from pg_class where oid='public.test_reset_jobs'::regclass) then
      raise exception 'Finalized attachments are immutable';
    end if;
    if not exists(select 1 from public.test_reset_control where id=1 and enabled)
      or not exists(select 1 from public.test_reset_jobs where id=nullif(current_setting('hydra.test_reset_job',true),'')::uuid and completed_at is null)
      then raise exception 'Finalized attachments are immutable'; end if;
  end if;
  if TG_OP='DELETE' then return old; end if; return new;
end $$;

create function public.begin_test_data_reset(actor uuid,request uuid,confirmation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.test_reset_jobs; totals jsonb; files jsonb;
begin
  perform pg_advisory_xact_lock(8141401);
  perform pg_advisory_xact_lock(8141402);
  if not exists(select 1 from public.profiles where id=actor and active and role='admin') then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if confirmation is distinct from 'RESET TEST DATA' or request is null then raise exception 'Type RESET TEST DATA exactly'; end if;
  if not exists(select 1 from public.test_reset_control where id=1 and enabled) then raise exception 'Test reset is disabled for this database'; end if;
  select * into job from public.test_reset_jobs where id=request;
  if found then return to_jsonb(job); end if;
  -- Resume cleanup instead of deleting any records created since an interrupted reset.
  select * into job from public.test_reset_jobs where completed_at is null;
  if found then return to_jsonb(job); end if;
  lock table public.finance_settlements,public.payments,public.finance_invoices,public.invoices,
    public.sales,public.supplier_documents,public.supplier_payments,public.supplier_invoices,
    public.vehicle_photos,public.vehicle_costs,public.vehicles,public.customers,public.finance_providers,
    public.audit_logs in share row exclusive mode;
  select jsonb_build_object('customers',(select count(*) from public.customers),
    'vehicles',(select count(*) from public.vehicles),'sales',(select count(*) from public.sales),
    'invoices',(select count(*) from public.invoices),'payments',(select count(*) from public.payments),
    'supplier_invoices',(select count(*) from public.supplier_invoices),
    'supplier_payments',(select count(*) from public.supplier_payments),
    'finance_providers',(select count(*) from public.finance_providers)) into totals;
  -- Only read Storage metadata. Actual object deletion is through the Storage API.
  select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'path',path)),'[]'::jsonb) into files
  from (
    select bucket_id as bucket,name as path from storage.objects
      where bucket_id in ('invoice-pdfs','vehicle-photos','supplier-documents')
    union select 'invoice-pdfs',sale_id::text||'/'||id::text||'.pdf' from public.invoices
    union select 'vehicle-photos',path from public.vehicle_photos
    union select 'supplier-documents',path from public.supplier_documents
  ) asset;
  insert into public.test_reset_jobs(id,actor_id,counts,assets) values(request,actor,totals,files) returning * into job;
  perform set_config('hydra.test_reset_job',request::text,true);
  delete from public.finance_settlements;
  delete from public.payments;
  delete from public.finance_invoices;
  delete from public.invoices;
  delete from public.sales;
  delete from public.supplier_documents;
  delete from public.supplier_payments;
  delete from public.supplier_invoices;
  delete from public.vehicle_photos;
  delete from public.vehicle_costs;
  delete from public.vehicles;
  delete from public.customers;
  delete from public.finance_providers;
  perform set_config('hydra.test_reset_job','',true);
  -- Remove personal/business snapshots, but keep staff/permission/settings audit history.
  delete from public.audit_logs where entity in ('finance_settlements','payments','finance_invoices','invoices',
    'sales','supplier_documents','supplier_payments','supplier_invoices','vehicle_photos','vehicle_costs',
    'vehicles','customers','finance_providers');
  insert into public.audit_logs(actor_id,action,entity,entity_id,after_data,reason)
    values(actor,'reset_started','test_reset_jobs',request,totals,'Administrator confirmed RESET TEST DATA');
  return to_jsonb(job);
end $$;

create function public.complete_test_data_reset(actor uuid,target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare job public.test_reset_jobs;
begin
  perform pg_advisory_xact_lock(8141402);
  if not exists(select 1 from public.profiles where id=actor and active and role='admin') then
    raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into job from public.test_reset_jobs where id=target for update;
  if not found then raise exception 'Reset job not found'; end if;
  if job.completed_at is not null then return; end if;
  if exists(select 1 from storage.objects o join jsonb_array_elements(job.assets) a
    on o.bucket_id=a->>'bucket' and o.name=a->>'path') then raise exception 'Uploaded files still need cleanup'; end if;
  update public.test_reset_jobs set assets='[]'::jsonb,completed_at=now() where id=target;
  insert into public.audit_logs(actor_id,action,entity,entity_id,after_data,reason)
    values(actor,'reset_completed','test_reset_jobs',target,job.counts,'Test business records and uploaded files cleared');
end $$;
revoke all on function public.begin_test_data_reset(uuid,uuid,text),public.complete_test_data_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_test_data_reset(uuid,uuid,text),public.complete_test_data_reset(uuid,uuid) to service_role;
commit;
