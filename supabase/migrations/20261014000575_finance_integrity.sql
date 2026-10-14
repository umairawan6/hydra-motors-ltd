begin;
drop index public.supplier_reference_unique;
create unique index supplier_reference_unique on public.supplier_invoices(lower(supplier_name),lower(supplier_reference)) where status='open';
alter table public.payments add column finance_invoice_id uuid references public.finance_invoices(id);
update public.payments p set finance_invoice_id=f.invoice_id from public.finance_settlements f where f.payment_id=p.id;
create unique index finance_remittance_unique on public.payments(finance_invoice_id,reference) where kind='receipt' and finance_invoice_id is not null;
-- Upgrade receipt allocation: finance payments and their link are one transaction.
drop function public.record_payment(uuid,numeric,text,text,uuid,uuid);
create function public.record_payment(target uuid,payment_amount numeric,payment_method text,payment_reference text,request uuid,refund_of uuid default null,source_finance uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.payments; original public.payments; result uuid; refunded numeric; reserved numeric; begin
  payment_reference:=trim(coalesce(payment_reference,''));
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('payments.manage') or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501'; end if;
  if request is null or payment_amount is null or payment_amount<=0 or payment_amount>9999999999.99 or payment_amount<>round(payment_amount,2) or payment_method not in ('bank_transfer','cash','card','finance') or payment_method is null or char_length(coalesce(payment_reference,''))>120 then raise exception 'Invalid money amount'; end if;
  if source_finance is not null and (not public.has_permission('finance.manage') or refund_of is not null or payment_method<>'finance' or trim(coalesce(payment_reference,''))='' or not exists(select 1 from public.finance_invoices where id=source_finance and sale_id=target and status='open')) then raise exception 'Invalid finance allocation'; end if;
  select * into prior from public.payments where request_key=request;
  if found then if prior.sale_id<>target or prior.amount<>payment_amount or prior.method<>payment_method or prior.reference<>coalesce(payment_reference,'') or prior.original_payment_id is distinct from refund_of or prior.finance_invoice_id is distinct from source_finance then raise exception 'Idempotency key reused'; end if;return prior.id;end if;
  perform 1 from public.sales where id=target and status='issued' for update;if not found then raise exception 'Sale must be issued';end if;
  if refund_of is null then
    if payment_amount>public.sale_balance(target) then raise exception 'Insufficient outstanding balance';end if;
    if source_finance is not null then
      if payment_amount>public.finance_balance(source_finance) then raise exception 'Insufficient outstanding balance';end if;
    else
      select coalesce(sum(f.total-coalesce((select sum(p.amount-coalesce((select sum(r.amount) from public.payments r where r.original_payment_id=p.id and r.kind='refund'),0)) from public.finance_settlements fs join public.payments p on p.id=fs.payment_id where fs.invoice_id=f.id),0)),0) into reserved from public.finance_invoices f where f.sale_id=target and f.status='open';
      if payment_amount>public.sale_balance(target)-reserved then raise exception 'Use the finance settlement workflow or reconcile outstanding finance invoices';end if;
    end if;
  else
    select * into original from public.payments where id=refund_of and sale_id=target and kind='receipt' for update;if not found then raise exception 'Original payment not found';end if;
    select coalesce(sum(amount),0) into refunded from public.payments where original_payment_id=refund_of and kind='refund';if payment_amount>original.amount-refunded then raise exception 'Refund exceeds original payment';end if;
  end if;
  insert into public.payments(sale_id,amount,method,reference,created_by,kind,original_payment_id,request_key,finance_invoice_id) values(target,payment_amount,payment_method,coalesce(payment_reference,''),auth.uid(),case when refund_of is null then 'receipt' else 'refund' end,refund_of,request,source_finance) returning id into result;
  if source_finance is not null then insert into public.finance_settlements(invoice_id,payment_id) values(source_finance,result);end if;
  return result;
end $$;
create or replace function public.settle_finance_invoice(target uuid,settlement_amount numeric,settlement_reference text,request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare invoice public.finance_invoices; existing public.payments; begin
  perform pg_advisory_xact_lock(8141402);
  select * into invoice from public.finance_invoices where id=target for update;
  if not found or not public.has_permission('finance.manage') or not public.has_permission('payments.manage') or not public.can_access_sale(invoice.sale_id) then raise exception 'Access denied' using errcode='42501';end if;
  select p.* into existing from public.finance_settlements f join public.payments p on p.id=f.payment_id where f.invoice_id=target and p.request_key=request;
  if found then if existing.amount<>settlement_amount or existing.reference<>trim(coalesce(settlement_reference,'')) then raise exception 'Idempotency key reused';end if;return existing.id;end if;
  if char_length(trim(coalesce(settlement_reference,''))) not between 1 and 120 then raise exception 'Settlement reference required';end if;
  return public.record_payment(invoice.sale_id,settlement_amount,'finance',trim(settlement_reference),request,null,target);
end $$;
create function public.guard_finance_credit() returns trigger language plpgsql security definer set search_path='' as $$
declare reserved numeric; paid numeric; begin
  if new.credited_amount<=old.credited_amount then return new;end if;
  select coalesce(sum(case when kind='receipt' then amount else -amount end),0) into paid from public.payments where sale_id=new.id;
  select coalesce(sum(f.total-coalesce((select sum(p.amount-coalesce((select sum(r.amount) from public.payments r where r.original_payment_id=p.id and r.kind='refund'),0)) from public.finance_settlements fs join public.payments p on p.id=fs.payment_id where fs.invoice_id=f.id),0)),0) into reserved from public.finance_invoices f where f.sale_id=new.id and f.status='open';
  if reserved>greatest(new.sale_price-new.credited_amount-paid,0) then raise exception 'Void or reconcile outstanding finance invoices before issuing this credit';end if;return new;
end $$;
create trigger guard_sale_finance_credit before update of credited_amount on public.sales for each row execute function public.guard_finance_credit();
create function public.return_credited_vehicle(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare sale public.sales; vehicle public.vehicles; begin
  perform pg_advisory_xact_lock(8141402);
  if not public.has_permission('invoices.credit') or not public.has_permission('stock.write') or not public.can_access_sale(target) then raise exception 'Access denied' using errcode='42501';end if;
  select * into sale from public.sales where id=target for update;
  if sale.status<>'issued' or sale.sale_price<=0 or sale.credited_amount<>sale.sale_price or public.sale_balance(target)<>0 then raise exception 'Fully credit the sale and refund receipts before returning stock';end if;
  if exists(select 1 from public.finance_invoices f where f.sale_id=target and f.status='open') then raise exception 'Void outstanding finance invoices before returning stock';end if;
  select * into vehicle from public.vehicles where id=sale.vehicle_id for update;
  if exists(select 1 from public.sales s where s.vehicle_id=sale.vehicle_id and s.id<>target and (s.status='draft' or (s.status='issued' and s.credited_amount<s.sale_price))) then raise exception 'Vehicle belongs to a newer sale';end if;
  if vehicle.status='available' then return;end if;
  if vehicle.status<>'sold' then raise exception 'Vehicle is no longer sold stock';end if;
  update public.vehicles set status='available',version=version+1,updated_at=now() where id=sale.vehicle_id;
end $$;
revoke all on function public.record_payment(uuid,numeric,text,text,uuid,uuid,uuid),public.guard_finance_credit(),public.return_credited_vehicle(uuid) from public,anon;
revoke all on function public.guard_finance_credit() from authenticated;
grant execute on function public.record_payment(uuid,numeric,text,text,uuid,uuid,uuid),public.return_credited_vehicle(uuid) to authenticated;
commit;
