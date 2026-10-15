import {beforeAll,afterAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {database,asStaff,staff} from './helpers/database';
import {reportSchema,reportRange,reportCsv} from '../lib/reports';
let db:PGlite;let sale:string;let vehicle:string;let provider:string;
beforeAll(async()=>{
  db=await database();vehicle=randomUUID();const customer=randomUUID();
  await db.query("insert into customers(id,full_name,address) values($1,'Report customer','Test address')",[customer]);
  await db.query("insert into vehicles(id,registration,make,model) values($1,'REPORT1','Test','Car')",[vehicle]);
  await db.exec("insert into billing_settings(company_name,address,registration_number,terms,approved) values('Test','Address','TEST','Terms',true)");
  await asStaff(db,staff.admin,async sql=>{
    await sql.query('select save_vehicle_costs($1,7000,500,0,0)',[vehicle]);
    sale=(await sql.query<{id:string}>('select save_sale_draft($1::jsonb,0) id',[JSON.stringify({customer_id:customer,vehicle_id:vehicle,list_price:'10000'})])).rows[0].id;
    await sql.query('select issue_sale($1,1,$2)',[sale,randomUUID()]);
    provider=(await sql.query<{id:string}>('select save_finance_provider($1::jsonb,0) id',[JSON.stringify({full_name:'Provider',address:'Address'})])).rows[0].id;
  },true);
});
afterAll(async()=>await db?.close());
async function report(sql:PGlite,from='2000-01-01',to='2009-12-31') {
  // Actual issue date keeps fixtures independent of the machine's current date.
  if(from==='2000-01-01') {from=(await sql.query<{d:string}>("select to_char(issued_at at time zone 'Europe/London','YYYY-MM-DD') d from sales where id=$1",[sale])).rows[0].d;to=from;}
  return reportSchema.parse((await sql.query<{r:unknown}>('select sales_profit_report($1::date,$2::date) r',[from,to])).rows[0].r);
}
it('reconciles the known sale/cost/payment fixture',async()=>{await asStaff(db,staff.admin,async sql=>{
  await sql.query("select record_payment($1,2000,'cash','Test',$2,null)",[sale,randomUUID()]);
  const r=await report(sql);expect(r.summary).toMatchObject({sales_count:1,gross:10000,revenue:10000,cash:2000,cost:7500,profit:2500});expect(r.outstanding).toBe(8000);
});});
it('counts additional costs once, ignores included base bills, and subtracts overhead',async()=>{await asStaff(db,staff.admin,async sql=>{
  const d=(await report(sql)).start_date;
  for(const [treatment,amount,v] of [['additional',500,vehicle],['included_in_base',7000,vehicle],['overhead',100,null]] as const) await sql.query('select create_supplier_invoice($1::jsonb,$2)',[JSON.stringify({supplier_name:'Supplier',supplier_reference:randomUUID(),total:String(amount),invoice_date:d,due_date:d,description:'Cost',vehicle_id:v,cost_treatment:treatment}),randomUUID()]);
  const r=await report(sql);expect(r.summary).toMatchObject({cost:8000,overhead:100,profit:1900});
});});
it('finance invoices do not duplicate revenue and settlements count as cash once',async()=>{await asStaff(db,staff.admin,async sql=>{
  const invoice=(await sql.query<{id:string}>('select create_finance_invoice($1,$2,8000,current_date,$3) id',[sale,provider,randomUUID()])).rows[0].id;
  await sql.query("select settle_finance_invoice($1,2000,'Reference',$2)",[invoice,randomUUID()]);
  const r=await report(sql);expect(r.summary.revenue).toBe(10000);expect(r.summary.cash).toBe(2000);expect(r.outstanding).toBe(8000);
});});
it('partial credits reduce revenue without reducing vehicle costs',async()=>{await asStaff(db,staff.admin,async sql=>{
  await sql.query("select credit_sale($1,500,'Test credit',false,$2)",[sale,randomUUID()]);
  const r=await report(sql);expect(r.summary).toMatchObject({revenue:9500,credits:500,cost:7500,profit:2000});expect(r.outstanding).toBe(9500);
});});
it('full credits reverse cost exactly once and expose refund due separately',async()=>{await asStaff(db,staff.admin,async sql=>{
  await sql.query("select record_payment($1,2000,'cash','',$2,null)",[sale,randomUUID()]);
  await sql.query("select credit_sale($1,4000,'Partial',false,$2)",[sale,randomUUID()]);
  await sql.query("select credit_sale($1,6000,'Full',false,$2)",[sale,randomUUID()]);
  const r=await report(sql);expect(r.summary).toMatchObject({revenue:0,cost:0,profit:0,credits:10000});expect(r.outstanding).toBe(0);expect(r.refundable).toBe(2000);
});});
it('withholds profit for absent cost records instead of assuming zero',async()=>{await db.exec('begin');try {
  await db.query('delete from vehicle_costs where vehicle_id=$1',[vehicle]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[staff.admin]);await db.exec('set local role authenticated');
  const r=await report(db);expect(r.summary.profit).toBeNull();expect(r.summary.missing_costs).toBe(1);
} finally {await db.exec('rollback');}});
it('recognizes the vehicle cost once after a fully credited vehicle is sold again',async()=>{await asStaff(db,staff.admin,async sql=>{
  await sql.query("select credit_sale($1,10000,'Returned',false,$2)",[sale,randomUUID()]);
  await sql.query('select return_credited_vehicle($1)',[sale]);
  const customer=(await sql.query<{customer_id:string}>('select customer_id from sales where id=$1',[sale])).rows[0].customer_id;
  const next=(await sql.query<{id:string}>('select save_sale_draft($1::jsonb,0) id',[JSON.stringify({customer_id:customer,vehicle_id:vehicle,list_price:'9000'})])).rows[0].id;
  await sql.query('select issue_sale($1,1,$2)',[next,randomUUID()]);
  const r=await report(sql);expect(r.summary).toMatchObject({sales_count:2,gross:19000,credits:10000,revenue:9000,cost:7500,profit:1500});
});});
it('returns no profit or cost fields or CSV columns to a sales-report manager',async()=>{await asStaff(db,staff.manager,async sql=>{
  const r=await report(sql);expect(r.profit_allowed).toBe(false);expect(r.summary).not.toHaveProperty('cost');expect(r.months[0]).not.toHaveProperty('profit');expect(reportCsv(r)).not.toMatch(/profit|cost|overhead/i);expect(r.summary.revenue).toBe(10000);
});});
it.each([staff.sales,staff.inactive,null])('denies direct RPC access for unpermitted/inactive/anonymous users %s',async id=>{
  await expect(asStaff(db,id,sql=>sql.query("select sales_profit_report('2026-01-01','2026-12-31')"))).rejects.toThrow();
});
it('requires costs.read as well as reports.profit',async()=>{await db.exec('begin');try {
  await db.exec("delete from role_permissions where role_key='accountant' and permission_key='costs.read'");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[staff.accountant]);await db.exec('set local role authenticated');
  const r=await report(db);expect(r.profit_allowed).toBe(false);expect(r.summary).not.toHaveProperty('cost');
} finally {await db.exec('rollback');}});
it('rejects inverted and excessive ranges at the database boundary',async()=>{
  for(const values of [['2026-12-31','2026-01-01'],['2000-01-01','2100-01-01']]) await expect(asStaff(db,staff.admin,sql=>sql.query('select sales_profit_report($1::date,$2::date)',values))).rejects.toThrow('Invalid report date range');
});
it('supports empty ranges and validates calendar dates for HTML and CSV',async()=>{await asStaff(db,staff.admin,async sql=>{
  const r=await report(sql,'2001-01-01','2001-02-28');expect(r.months).toHaveLength(2);expect(r.summary.revenue).toBe(0);expect(r.summary.profit).toBe(0);expect(reportCsv(r)).toContain('Trading profit GBP');
});expect(()=>reportRange({from:'2026-02-30',to:'2026-03-01'})).toThrow();expect(()=>reportRange({from:'2026-02-01',to:'2026-01-01'})).toThrow();});
it('uses London dates at the summer-time month boundary and credits in their own period',async()=>{
  await db.exec('begin');try {
    const v=randomUUID();const s=randomUUID();
    await db.query("insert into vehicles(id,registration,make,model) values($1,'BOUNDARY','Test','Car')",[v]);
    await db.query('insert into vehicle_costs(vehicle_id,purchase_cost) values($1,7000)',[v]);
    await db.query("insert into sales(id,customer_id,vehicle_id,sale_price,list_price,status,created_by,issued_at,credited_amount) select $1,customer_id,$2,10000,10000,'issued',$3,'2026-03-31T23:30:00Z',10000 from sales where id=$4",[s,v,staff.admin,sale]);
    await db.query("insert into invoices(sale_id,invoice_type,total,issued_at) values($1,'credit',10000,'2026-04-30T23:30:00Z')",[s]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[staff.admin]);await db.exec('set local role authenticated');
    const march=await report(db,'2026-03-01','2026-03-31');const april=await report(db,'2026-04-01','2026-04-30');const may=await report(db,'2026-05-01','2026-05-31');
    expect(march.summary.gross).toBe(0);expect(april.summary).toMatchObject({gross:10000,credits:0,cost:7000,profit:3000});expect(may.summary).toMatchObject({gross:0,credits:10000,cost:-7000,profit:-3000});
    expect((await report(db,'2026-04-01','2026-05-31')).summary.profit).toBe(0);
  } finally {await db.exec('rollback');}
});
it('excludes cancelled drafts and flags undated legacy sales',async()=>{await db.exec('begin');try {
  await db.query('update sales set issued_at=null where id=$1',[sale]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[staff.admin]);await db.exec('set local role authenticated');
  const r=await report(db,'2026-01-01','2026-12-31');expect(r.undated_sales).toBe(1);expect(r.summary.gross).toBe(0);expect(r.outstanding).toBe(10000);
} finally {await db.exec('rollback');}});
