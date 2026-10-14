-- Baseline of the original starter; apply only to a fresh database.
-- gen_random_uuid() is built into the supported PostgreSQL versions.
create type public.staff_role as enum ('admin','manager','sales','accountant');
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null default '',role public.staff_role not null default 'sales',active boolean not null default false,created_at timestamptz not null default now());
create table public.customers(id uuid primary key default gen_random_uuid(),full_name text not null,email text,phone text,address text,created_at timestamptz not null default now());
create table public.vehicles(id uuid primary key default gen_random_uuid(),registration text not null unique,vin text unique,make text not null,model text not null,model_year integer,mileage integer check(mileage>=0),created_at timestamptz not null default now());
create table public.vehicle_costs(vehicle_id uuid primary key references public.vehicles(id) on delete restrict,purchase_cost numeric(12,2) not null default 0 check(purchase_cost>=0),preparation_cost numeric(12,2) not null default 0 check(preparation_cost>=0),other_cost numeric(12,2) not null default 0 check(other_cost>=0),updated_at timestamptz not null default now());
create table public.sales(id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.customers(id),vehicle_id uuid not null references public.vehicles(id),invoice_number text unique,sale_price numeric(12,2) not null check(sale_price>=0),status text not null default 'draft' check(status in ('draft','issued','void')),created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),unique(vehicle_id));
create table public.payments(id uuid primary key default gen_random_uuid(),sale_id uuid not null references public.sales(id),amount numeric(12,2) not null check(amount>0),method text not null,received_at timestamptz not null default now(),created_by uuid not null default auth.uid() references auth.users(id));
create table public.invoices(id uuid primary key default gen_random_uuid(),sale_id uuid not null references public.sales(id),invoice_type text not null check(invoice_type in ('customer','finance')),version integer not null default 1,document_path text,issued_at timestamptz,unique(sale_id,invoice_type,version));
create table public.audit_logs(id bigint generated always as identity primary key,actor_id uuid references auth.users(id),action text not null,entity text not null,entity_id uuid,created_at timestamptz not null default now());
create function public.my_role() returns public.staff_role language sql stable security definer set search_path='' as $$select role from public.profiles where id=(select auth.uid()) and active=true$$;
create function public.is_active() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=(select auth.uid()) and active=true)$$;
revoke all on function public.my_role() from public;revoke all on function public.is_active() from public;
grant execute on function public.my_role() to authenticated;grant execute on function public.is_active() to authenticated;
-- Profiles are provisioned by trusted admin via Supabase dashboard / service-side provisioning only.
create function public.new_user_profile() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.profiles(id) values(new.id);return new;end$$;
create trigger profile_on_signup after insert on auth.users for each row execute function public.new_user_profile();
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_costs enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.invoices enable row level security;
alter table public.audit_logs enable row level security;
create policy profiles_self_read on public.profiles for select to authenticated using(id=(select auth.uid()) and public.is_active());
create policy profiles_admin_read on public.profiles for select to authenticated using(public.my_role()='admin');
create policy customer_read on public.customers for select to authenticated using(public.is_active());
create policy customer_insert on public.customers for insert to authenticated with check(public.my_role() in ('admin','manager','sales'));
create policy vehicle_read on public.vehicles for select to authenticated using(public.is_active());
create policy vehicle_insert on public.vehicles for insert to authenticated with check(public.my_role() in ('admin','manager','sales'));
create policy costs_read on public.vehicle_costs for select to authenticated using(public.my_role() in ('admin','accountant'));
create policy costs_insert on public.vehicle_costs for insert to authenticated with check(public.my_role()='admin');
create policy costs_update on public.vehicle_costs for update to authenticated using(public.my_role()='admin') with check(public.my_role()='admin');
create policy sales_read on public.sales for select to authenticated using(public.my_role() in ('admin','manager','accountant') or (public.my_role()='sales' and created_by=(select auth.uid())));
create policy sales_insert on public.sales for insert to authenticated with check(public.my_role() in ('admin','manager','sales') and created_by=(select auth.uid()) and status='draft' and invoice_number is null);
create policy sales_update_draft on public.sales for update to authenticated using(status='draft' and (public.my_role() in ('admin','manager') or (public.my_role()='sales' and created_by=(select auth.uid())))) with check(status='draft' and (public.my_role() in ('admin','manager') or (public.my_role()='sales' and created_by=(select auth.uid()))));
create policy payments_read on public.payments for select to authenticated using(exists(select 1 from public.sales s where s.id=sale_id));
-- Payment inserts and invoice issuance intentionally server-only until audited workflows are implemented.
create policy invoices_read on public.invoices for select to authenticated using(exists(select 1 from public.sales s where s.id=sale_id));
-- Audit logs are write-only via trusted backend (no client policies).
-- Initial admin: create user in Supabase Auth, then execute manually with their UUID:
-- update public.profiles set role='admin',active=true,full_name='Owner' where id='USER-UUID-HERE';
