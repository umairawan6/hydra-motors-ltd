begin;
create or replace function public.audit_access_change() returns trigger language plpgsql security definer set search_path='' as $$ begin
  insert into public.audit_logs(actor_id,action,entity,entity_id,before_data,after_data) values(auth.uid(),lower(TG_OP),TG_TABLE_NAME,
    case when TG_TABLE_NAME='billing_settings' then null else coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'vehicle_id',to_jsonb(old)->>'vehicle_id')::uuid end,
    case when TG_OP<>'INSERT' then to_jsonb(old) else null end,case when TG_OP<>'DELETE' then to_jsonb(new) else null end);
  return coalesce(new,old);
end $$;
drop policy audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using(public.has_permission('audit.read') and case
  when entity='customers' then public.has_permission('customers.read')
  when entity='vehicles' then public.has_permission('stock.read')
  when entity='vehicle_costs' then public.has_permission('costs.read')
  when entity='sales' then public.can_access_sale(coalesce(after_data->>'id',before_data->>'id')::uuid)
  when entity in ('payments','invoices') then public.can_access_sale(coalesce(after_data->>'sale_id',before_data->>'sale_id')::uuid) and (entity<>'invoices' or coalesce(after_data->>'invoice_type',before_data->>'invoice_type')<>'finance' or public.has_permission('finance.manage'))
  when entity='supplier_invoices' then public.can_access_supplier(coalesce(after_data->>'id',before_data->>'id')::uuid)
  when entity='supplier_payments' then public.can_access_supplier(coalesce(after_data->>'invoice_id',before_data->>'invoice_id')::uuid)
  when entity='finance_invoices' then public.has_permission('finance.manage') and public.can_access_sale(coalesce(after_data->>'sale_id',before_data->>'sale_id')::uuid)
  when entity='finance_settlements' then exists(select 1 from public.finance_invoices f where f.id=coalesce(after_data->>'invoice_id',before_data->>'invoice_id')::uuid)
  when entity='finance_providers' then public.has_permission('finance.manage')
  else true end);
commit;
