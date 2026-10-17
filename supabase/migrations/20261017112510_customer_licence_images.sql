begin;
insert into public.permissions(key,description) values
 ('customers.licence_read','View customer driving licence images'),
 ('customers.licence_manage','Upload and remove customer driving licence images');
insert into public.role_permissions(role_key,permission_key) values
 ('admin','customers.licence_read'),('admin','customers.licence_manage');
create table public.customer_licence_images(
 id uuid primary key,
 customer_id uuid not null references public.customers(id) on delete restrict,
 side text not null check(side in ('front','back')),
 path text not null unique,
 ready boolean not null default false,
 created_at timestamptz not null default now(),
 unique(customer_id,side),
 check(path in (customer_id::text||'/'||id::text||'.jpg',customer_id::text||'/'||id::text||'.png',customer_id::text||'/'||id::text||'.webp'))
);
alter table public.customer_licence_images enable row level security;
revoke all on public.customer_licence_images from public,anon,authenticated;
grant select,insert,delete on public.customer_licence_images to authenticated;
grant update(ready) on public.customer_licence_images to authenticated;
create policy licence_read on public.customer_licence_images for select to authenticated using(
 public.has_permission('customers.read') and public.has_permission('customers.licence_read'));
create policy licence_insert on public.customer_licence_images for insert to authenticated with check(
 public.has_permission('customers.read') and public.has_permission('customers.licence_read') and public.has_permission('customers.licence_manage') and not ready
 and exists(select 1 from public.customers c where c.id=customer_id and not c.archived));
create policy licence_finalize on public.customer_licence_images for update to authenticated using(
 public.has_permission('customers.read') and public.has_permission('customers.licence_read') and public.has_permission('customers.licence_manage') and not ready) with check(
 public.has_permission('customers.read') and public.has_permission('customers.licence_read') and public.has_permission('customers.licence_manage'));
create policy licence_remove on public.customer_licence_images for delete to authenticated using(
 public.has_permission('customers.read') and public.has_permission('customers.licence_read') and public.has_permission('customers.licence_manage'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('customer-licences','customer-licences',false,3145728,array['image/jpeg','image/png','image/webp']);
create policy hydra_licence_download on storage.objects for select to authenticated using(
 bucket_id='customer-licences' and exists(select 1 from public.customer_licence_images l where l.path=name and (l.ready or public.has_permission('customers.licence_manage'))));
create policy hydra_licence_upload on storage.objects for insert to authenticated with check(
 bucket_id='customer-licences' and public.has_permission('customers.licence_manage') and exists(select 1 from public.customer_licence_images l where l.path=name and not l.ready));
create policy hydra_licence_remove on storage.objects for delete to authenticated using(
 bucket_id='customer-licences' and public.has_permission('customers.licence_manage') and exists(select 1 from public.customer_licence_images l where l.path=name));
create or replace function public.begin_test_data_reset(actor uuid,request uuid,confirmation text) returns jsonb
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
    public.customer_licence_images,public.vehicle_photos,public.vehicle_costs,public.vehicles,public.customers,public.finance_providers,
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
      where bucket_id in ('invoice-pdfs','vehicle-photos','supplier-documents','customer-licences')
    union select 'invoice-pdfs',sale_id::text||'/'||id::text||'.pdf' from public.invoices
    union select 'vehicle-photos',path from public.vehicle_photos
    union select 'supplier-documents',path from public.supplier_documents
    union select 'customer-licences',path from public.customer_licence_images
  ) asset;
  insert into public.test_reset_jobs(id,actor_id,counts,assets) values(request,actor,totals,files) returning * into job;
  perform set_config('hydra.test_reset_job',request::text,true);
  delete from public.finance_settlements where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.payments where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.finance_invoices where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.invoices where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.sales where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.supplier_documents where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.supplier_payments where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.supplier_invoices where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.customer_licence_images where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.vehicle_photos where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.vehicle_costs where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.vehicles where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.customers where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  delete from public.finance_providers where exists(select 1 from public.test_reset_jobs r where r.id=request and r.actor_id=actor and r.completed_at is null);
  perform set_config('hydra.test_reset_job','',true);
  -- Remove personal/business snapshots, but keep staff/permission/settings audit history.
  delete from public.audit_logs where entity in ('finance_settlements','payments','finance_invoices','invoices',
    'sales','supplier_documents','supplier_payments','supplier_invoices','vehicle_photos','vehicle_costs',
    'vehicles','customers','finance_providers');
  insert into public.audit_logs(actor_id,action,entity,entity_id,after_data,reason)
    values(actor,'reset_started','test_reset_jobs',request,totals,'Administrator confirmed RESET TEST DATA');
  return to_jsonb(job);
end $$;
commit;
