begin;
-- Report permission deliberately grants dealership-wide aggregates, not customer records.
-- Definer is required because ordinary sales RLS may be narrower than report permission.
create function public.sales_profit_report(start_date date,end_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; profit_allowed boolean; outstanding numeric; refundable numeric;
begin
  if auth.uid() is null or not public.has_permission('reports.sales') then raise exception 'Access denied' using errcode='42501'; end if;
  if start_date is null or end_date is null or start_date>end_date or end_date-start_date>3660
    or start_date<date '2000-01-01' or end_date>date '2100-12-31' then raise exception 'Invalid report date range'; end if;
  profit_allowed:=public.has_permission('reports.profit') and public.has_permission('costs.read');
  with balances as (
    select s.sale_price-s.credited_amount-coalesce(p.paid,0) balance
    from public.sales s left join (select sale_id,sum(case when kind='receipt' then amount else -amount end) paid from public.payments group by sale_id) p on p.sale_id=s.id
    where s.status='issued'
  ) select coalesce(sum(greatest(balance,0)),0),coalesce(sum(greatest(-balance,0)),0) into outstanding,refundable from balances;
  with issued as (
    select s.*, (s.issued_at at time zone 'Europe/London')::date event_date
    from public.sales s where s.status='issued' and s.issued_at is not null
  ), costs as (
    select s.id, c.vehicle_id is null missing,
      coalesce(c.purchase_cost+c.preparation_cost+c.other_cost,0)+coalesce(e.extra,0) cost
    from issued s left join public.vehicle_costs c on c.vehicle_id=s.vehicle_id
    left join (select vehicle_id,sum(total) extra from public.supplier_invoices where status='open' and cost_treatment='additional' group by vehicle_id) e on e.vehicle_id=s.vehicle_id
    where profit_allowed
  ), events as (
    select s.event_date,1::bigint sales_count,s.sale_price gross,0::numeric credits,0::numeric cash,
      coalesce(c.cost,0) cost,case when c.missing then 1 else 0 end missing,0::numeric overhead
    from issued s left join costs c on c.id=s.id
    union all
    select (i.issued_at at time zone 'Europe/London')::date,0,0,i.total,0,0,0,0
      from public.invoices i where i.invoice_type='credit'
    union all
    select (p.received_at at time zone 'Europe/London')::date,0,0,0,case when p.kind='receipt' then p.amount else -p.amount end,0,0,0 from public.payments p
    union all
    -- A full credit reverses the vehicle cost once, on the final credit's date.
    select (x.last_credit at time zone 'Europe/London')::date,0,0,0,0,-c.cost,case when c.missing then 1 else 0 end,0
      from issued s join costs c on c.id=s.id
      join (select sale_id,max(issued_at) last_credit from public.invoices where invoice_type='credit' group by sale_id) x on x.sale_id=s.id
      where s.sale_price>0 and s.credited_amount=s.sale_price
    union all
    select invoice_date,0,0,0,0,0,0,total from public.supplier_invoices where profit_allowed and status='open' and cost_treatment='overhead'
  ), monthly as (
    select date_trunc('month',event_date)::date as period_start,sum(sales_count) sales_count,sum(gross) gross,sum(credits) credits,sum(cash) cash,sum(cost) cost,sum(missing) missing,sum(overhead) overhead
    from events where event_date between start_date and end_date group by 1
  ), periods as (
    select d::date as period_start,coalesce(m.sales_count,0) sales_count,coalesce(m.gross,0) gross,coalesce(m.credits,0) credits,coalesce(m.cash,0) cash,
      coalesce(m.cost,0) cost,coalesce(m.missing,0) missing,coalesce(m.overhead,0) overhead
    from generate_series(date_trunc('month',start_date::timestamp),date_trunc('month',end_date::timestamp),interval '1 month') d left join monthly m on m.period_start=d::date
  ) select jsonb_build_object('generated_at',now(),'start_date',start_date,'end_date',end_date,'profit_allowed',profit_allowed,
    'outstanding',outstanding,'refundable',refundable,'undated_sales',(select count(*) from public.sales where status='issued' and issued_at is null),
    'summary',jsonb_build_object('sales_count',sum(sales_count),'gross',sum(gross),'credits',sum(credits),'revenue',sum(gross-credits),'cash',sum(cash)) ||
      case when profit_allowed then jsonb_build_object('cost',sum(cost),'overhead',sum(overhead),'missing_costs',sum(missing),
      'profit',case when exists(select 1 from periods where missing<>0) then null else sum(gross-credits-cost-overhead) end) else '{}'::jsonb end,
    'months',jsonb_agg(jsonb_build_object('month',period_start,'sales_count',sales_count,'gross',gross,'credits',credits,'revenue',gross-credits,'cash',cash) ||
      case when profit_allowed then jsonb_build_object('cost',cost,'overhead',overhead,'missing_costs',abs(missing),'profit',case when missing<>0 then null else gross-credits-cost-overhead end) else '{}'::jsonb end order by period_start)) into result from periods;
  return result;
end $$;
revoke all on function public.sales_profit_report(date,date) from public,anon;
grant execute on function public.sales_profit_report(date,date) to authenticated;
commit;


