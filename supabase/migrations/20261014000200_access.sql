-- Upgrade the original starter without dropping business records.
begin;
-- Replace the starter's fixed-role policies before changing the role column.
do $$ declare item record; begin
  for item in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in
      ('profiles','customers','vehicles','vehicle_costs','sales','payments','invoices','audit_logs')
  loop execute format('drop policy %I on %I.%I', item.policyname, item.schemaname, item.tablename); end loop;
end $$;
drop function public.my_role();
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type text using role::text;
alter table public.profiles alter column role set default 'sales';
drop type public.staff_role;

create table public.roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null check (char_length(name) between 2 and 60),
  system_role boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.permissions (key text primary key, description text not null);
create table public.role_permissions (
  role_key text not null references public.roles(key) on delete restrict,
  permission_key text not null references public.permissions(key) on delete restrict,
  primary key(role_key, permission_key)
);
insert into public.roles(key,name,system_role) values
  ('admin','Administrator',true),('manager','Manager',true),('sales','Sales',true),('accountant','Accountant',true);
insert into public.permissions values
  ('customers.read','Read customers'),('customers.write','Manage customers'),
  ('stock.read','Read vehicles'),('stock.write','Manage vehicles'),
  ('costs.read','Read vehicle costs'),('costs.write','Manage vehicle costs'),
  ('sales.read_all','Read all sales'),('sales.write','Manage sale drafts'),
  ('sales.issue','Issue customer invoices'),('invoices.credit','Credit or void invoices'),
  ('payments.manage','Record payments'),('finance.manage','Manage financial invoices'),
  ('reports.sales','Read sales reports'),('reports.profit','Read profit reports'),
  ('users.manage','Manage staff accounts'),('roles.manage','Manage role permissions'),('audit.read','Read audit log');
insert into public.role_permissions select 'admin',key from public.permissions;
insert into public.role_permissions select 'manager',key from public.permissions where key in
  ('customers.read','customers.write','stock.read','stock.write','sales.read_all','sales.write','sales.issue','invoices.credit','reports.sales');
insert into public.role_permissions select 'sales',key from public.permissions where key in
  ('customers.read','customers.write','stock.read','stock.write','sales.write','sales.issue');
insert into public.role_permissions select 'accountant',key from public.permissions where key in
  ('customers.read','stock.read','costs.read','costs.write','sales.read_all','invoices.credit','payments.manage','finance.manage','reports.sales','reports.profit');
alter table public.profiles add constraint profiles_role_fk foreign key(role) references public.roles(key);
alter table public.profiles add column email text not null default '';
update public.profiles p set email=coalesce(u.email,'') from auth.users u where u.id=p.id;
alter table public.profiles add column updated_at timestamptz not null default now();
alter table public.audit_logs add column before_data jsonb;
alter table public.audit_logs add column after_data jsonb;
alter table public.audit_logs add column reason text;
create index profiles_role_active_idx on public.profiles(role,active);
create index sales_creator_created_idx on public.sales(created_by,created_at desc);
create index audit_created_idx on public.audit_logs(created_at desc);

create function public.has_permission(permission text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join public.role_permissions rp on rp.role_key=p.role
    where p.id=(select auth.uid()) and p.active and rp.permission_key=permission)
$$;
create function public.effective_permissions() returns text[]
language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(rp.permission_key order by rp.permission_key),array[]::text[])
  from public.profiles p join public.role_permissions rp on rp.role_key=p.role
  where p.id=(select auth.uid()) and p.active
$$;
revoke all on function public.has_permission(text), public.effective_permissions() from public,anon;
grant execute on function public.has_permission(text), public.effective_permissions() to authenticated;

create or replace function public.new_user_profile() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  insert into public.profiles(id,email) values(new.id,coalesce(new.email,'')); return new;
end $$;
create function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  update public.profiles set email=coalesce(new.email,''),updated_at=now() where id=new.id; return new;
end $$;
create trigger sync_staff_email after update of email on auth.users for each row execute function public.sync_profile_email();

create function public.audit_access_change() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  insert into public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data)
  values(auth.uid(),lower(TG_OP),TG_TABLE_NAME,
    case when TG_TABLE_NAME='profiles' then coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id')::uuid else null end,
    case when TG_OP<>'INSERT' then to_jsonb(old) else null end,
    case when TG_OP<>'DELETE' then to_jsonb(new) else null end);
  return coalesce(new,old);
end $$;
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_access_change();
create trigger audit_roles after insert or update or delete on public.roles for each row execute function public.audit_access_change();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions for each row execute function public.audit_access_change();

-- Mutations are RPC-only: serialize access changes and preserve the final admin.
create function public.set_staff_access(target_id uuid, target_name text, target_role text, target_active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.profiles; begin
  perform pg_advisory_xact_lock(8141401);
  if not public.has_permission('users.manage') then raise exception 'Access denied' using errcode='42501'; end if;
  if target_id=auth.uid() then raise exception 'Ask another administrator to change your own access'; end if;
  if target_name is null or char_length(trim(target_name)) not between 1 and 120 or target_active is null then raise exception 'Invalid staff details'; end if;
  select * into previous from public.profiles where id=target_id for update;
  if not found then raise exception 'Staff account not found'; end if;
  if not exists(select 1 from public.roles where key=target_role) then raise exception 'Unknown role'; end if;
  -- Delegated staff managers cannot promote/demote admins or grant permissions they lack.
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active) then
    if previous.role='admin' or target_role='admin' or exists(
      select 1 from public.role_permissions where role_key=target_role and not public.has_permission(permission_key)
    ) then raise exception 'Cannot grant elevated access' using errcode='42501'; end if;
  end if;
  if previous.role='admin' and previous.active and (target_role<>'admin' or not target_active)
    and (select count(*) from public.profiles where role='admin' and active)<=1 then raise exception 'Keep at least one active administrator'; end if;
  update public.profiles set full_name=trim(target_name),role=target_role,active=target_active,updated_at=now() where id=target_id;
end $$;

create function public.create_staff_role(role_key text, role_name text) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform pg_advisory_xact_lock(8141401);
  if not public.has_permission('roles.manage') then raise exception 'Access denied' using errcode='42501'; end if;
  if role_key is null or role_name is null then raise exception 'Invalid role'; end if;
  insert into public.roles(key,name) values(role_key,trim(role_name));
end $$;

create function public.set_role_permissions(target_role text, requested_permissions text[]) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform pg_advisory_xact_lock(8141401);
  if not public.has_permission('roles.manage') then raise exception 'Access denied' using errcode='42501'; end if;
  if not exists(select 1 from public.roles where key=target_role) or requested_permissions is null then raise exception 'Invalid role'; end if;
  if exists(select 1 from unnest(requested_permissions) x where x is null or not exists(select 1 from public.permissions where key=x)) then raise exception 'Unknown permission'; end if;
  if target_role='admin' and not requested_permissions @> array['users.manage','roles.manage','audit.read']::text[] then raise exception 'Administrator access controls cannot be removed'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active) then
    if target_role='admin' or target_role=(select role from public.profiles where id=auth.uid()) or exists(
      select 1 from unnest(requested_permissions) x where not public.has_permission(x)
    ) then raise exception 'Cannot grant elevated access' using errcode='42501'; end if;
  end if;
  delete from public.role_permissions where role_key=target_role;
  insert into public.role_permissions select target_role,x from (select distinct unnest(requested_permissions) x) permissions;
end $$;
revoke all on function public.set_staff_access(uuid,text,text,boolean), public.create_staff_role(text,text), public.set_role_permissions(text,text[]) from public,anon;
grant execute on function public.set_staff_access(uuid,text,text,boolean), public.create_staff_role(text,text), public.set_role_permissions(text,text[]) to authenticated;
revoke all on function public.new_user_profile(),public.sync_profile_email(),public.audit_access_change() from public,anon,authenticated;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
-- Explicit grants: Supabase defaults vary between new and upgraded projects.
revoke all on public.profiles,public.roles,public.permissions,public.role_permissions,public.audit_logs from anon,authenticated;
grant select on public.profiles,public.roles,public.permissions,public.role_permissions,public.audit_logs to authenticated;
grant select on public.customers,public.vehicles,public.vehicle_costs,public.sales,public.payments,public.invoices to authenticated;
revoke all on public.customers,public.vehicles,public.vehicle_costs,public.sales,public.payments,public.invoices from anon;
-- Issuance/payment workflows remain disabled until their later transactional phases.
revoke insert,update,delete on public.sales,public.payments,public.invoices from authenticated;
grant insert,update on public.customers,public.vehicles,public.vehicle_costs to authenticated;
revoke delete on public.customers,public.vehicles,public.vehicle_costs from authenticated;
create policy profiles_read on public.profiles for select to authenticated using
  ((id=auth.uid() and public.is_active()) or public.has_permission('users.manage'));
create policy roles_read on public.roles for select to authenticated using(public.is_active());
create policy permissions_read on public.permissions for select to authenticated using(public.is_active());
create policy role_permissions_read on public.role_permissions for select to authenticated using(public.is_active());
create policy audit_read on public.audit_logs for select to authenticated using(public.has_permission('audit.read'));
create policy customers_read on public.customers for select to authenticated using(public.has_permission('customers.read'));
create policy customers_insert on public.customers for insert to authenticated with check(public.has_permission('customers.write'));
create policy customers_update on public.customers for update to authenticated using(public.has_permission('customers.write')) with check(public.has_permission('customers.write'));
create policy vehicles_read on public.vehicles for select to authenticated using(public.has_permission('stock.read'));
create policy vehicles_insert on public.vehicles for insert to authenticated with check(public.has_permission('stock.write'));
create policy vehicles_update on public.vehicles for update to authenticated using(public.has_permission('stock.write')) with check(public.has_permission('stock.write'));
create policy costs_read on public.vehicle_costs for select to authenticated using(public.has_permission('costs.read'));
create policy costs_insert on public.vehicle_costs for insert to authenticated with check(public.has_permission('costs.write'));
create policy costs_update on public.vehicle_costs for update to authenticated using(public.has_permission('costs.write')) with check(public.has_permission('costs.write'));
create policy sales_read on public.sales for select to authenticated using
  (public.is_active() and (public.has_permission('sales.read_all') or (created_by=auth.uid() and public.has_permission('sales.write'))));
create policy payments_read on public.payments for select to authenticated using(exists(select 1 from public.sales s where s.id=sale_id));
create policy invoices_read on public.invoices for select to authenticated using
  ((invoice_type='customer' or public.has_permission('finance.manage')) and exists(select 1 from public.sales s where s.id=sale_id));
commit;
