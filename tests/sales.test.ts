import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {database,asStaff,staff} from './helpers/database';
let db:PGlite; const customer='20000000-0000-4000-8000-000000000001'; const vehicle='30000000-0000-4000-8000-000000000001';
beforeAll(async()=>{db=await database(); await db.query("insert into customers(id,full_name,address) values($1,'Customer','Test address')",[customer]); await db.query("insert into vehicles(id,registration,make,model) values($1,'TEST01','Test','Car')",[vehicle]); await db.query("insert into billing_settings(company_name,address,registration_number,terms,approved) values('Test Motors','Test address','TEST-123','Test terms',true)");});
afterAll(async()=>await db?.close());
async function issued(sql:PGlite) {const draft=await sql.query<{id:string}>('select save_sale_draft($1::jsonb,0) id',[JSON.stringify({customer_id:customer,vehicle_id:vehicle,list_price:'10000',discount:'0',fees:'0'})]); const sale=draft.rows[0].id; const key=randomUUID(); const invoice=await sql.query<{id:string}>('select issue_sale($1,1,$2) id',[sale,key]); return {sale,invoice:invoice.rows[0].id,key};}
describe('transactional sales',()=>{
  it('snapshots gearbox while allowing an independent invoice price',async()=>{await asStaff(db,staff.admin,async sql=>{
    await sql.query("select save_vehicle($1::jsonb,1)",[JSON.stringify({id:vehicle,registration:'TEST01',make:'Test',model:'Car',model_year:2024,mileage:10000,status:'available',asking_price:'12000',gearbox:'automatic'})]);
    const {invoice}=await issued(sql);
    const snapshot=(await sql.query<{snapshot:{total:number;vehicle:{gearbox:string}}}>('select snapshot from invoices where id=$1',[invoice])).rows[0].snapshot;
    expect(snapshot.total).toBe(10000);expect(snapshot.vehicle.gearbox).toBe('automatic');
    expect((await sql.query<{asking_price:string}>('select asking_price from vehicles where id=$1',[vehicle])).rows[0].asking_price).toBe('12000.00');
  });});
  it.each([3,6,12])('preserves %s month warranty through draft editing and immutable issuance',async months=>{
    await asStaff(db,staff.admin,async sql=>{
      const payload={customer_id:customer,vehicle_id:vehicle,list_price:'10000',warranty_months:String(months)};
      const sale=(await sql.query<{id:string}>('select save_sale_draft($1::jsonb,0) id',[JSON.stringify(payload)])).rows[0].id;
      await sql.query('select save_sale_draft($1::jsonb,1)',[JSON.stringify({...payload,id:sale})]);
      const invoice=(await sql.query<{id:string}>('select issue_sale($1,2,$2) id',[sale,randomUUID()])).rows[0].id;
      expect((await sql.query<{snapshot:{warranty_months:number}}>('select snapshot from invoices where id=$1',[invoice])).rows[0].snapshot.warranty_months).toBe(months);
      await expect(sql.query('select save_sale_draft($1::jsonb,3)',[JSON.stringify({...payload,id:sale,warranty_months:'6'})])).rejects.toThrow();
    });
  });
  it('rejects unsupported warranty durations through the direct RPC',async()=>{
    await expect(asStaff(db,staff.admin,sql=>sql.query('select save_sale_draft($1::jsonb,0)',[JSON.stringify({customer_id:customer,vehicle_id:vehicle,list_price:'10000',warranty_months:'24'})]))).rejects.toThrow('Invalid warranty duration');
  });
  it('edits a draft, removes it with history and releases its vehicle for a new draft',async()=>{
    await asStaff(db,staff.admin,async sql=>{
      const payload={customer_id:customer,vehicle_id:vehicle,list_price:'10000',discount:'0',fees:'0'};
      const sale=(await sql.query<{id:string}>('select save_sale_draft($1::jsonb,0) id',[JSON.stringify(payload)])).rows[0].id;
      await sql.query('select save_sale_draft($1::jsonb,1)',[JSON.stringify({...payload,id:sale,list_price:'9500'})]);
      expect(Number((await sql.query<{sale_price:string}>('select sale_price from sales where id=$1',[sale])).rows[0].sale_price)).toBe(9500);
      await sql.query('select cancel_sale_draft($1,2)',[sale]);
      expect((await sql.query<{status:string}>('select status from sales where id=$1',[sale])).rows[0].status).toBe('void');
      expect((await sql.query('select save_sale_draft($1::jsonb,0)',[JSON.stringify(payload)])).rows).toHaveLength(1);
    });
  });
  it('rejects cancelling an issued sale through the draft removal action',async()=>{
    await asStaff(db,staff.admin,async sql=>{
      const {sale}=await issued(sql);
      await expect(sql.query('select cancel_sale_draft($1,2)',[sale])).rejects.toThrow();
    });
  });
  it('issues once, snapshots the invoice and marks stock sold',async()=>{await asStaff(db,staff.admin,async sql=>{const {sale,invoice,key}=await issued(sql); expect((await sql.query<{id:string}>('select issue_sale($1,1,$2) id',[sale,key])).rows[0].id).toBe(invoice); expect((await sql.query<{status:string}>('select status from vehicles where id=$1',[vehicle])).rows[0].status).toBe('sold'); expect((await sql.query<{snapshot:{customer:{full_name:string}}}>('select snapshot from invoices where id=$1',[invoice])).rows[0].snapshot.customer.full_name).toBe('Customer'); await expect(sql.query('select issue_sale($1,1,$2)',[sale,randomUUID()])).rejects.toThrow('Draft changed');});});
  it('prevents a second active sale for the same vehicle',async()=>{await asStaff(db,staff.sales,async sql=>{const payload=JSON.stringify({customer_id:customer,vehicle_id:vehicle,list_price:'10000'}); await sql.query('select save_sale_draft($1::jsonb,0)',[payload]); await expect(sql.query('select save_sale_draft($1::jsonb,0)',[payload])).rejects.toThrow('duplicate');});});
  it('requires approved settings and rolls back failed issuance',async()=>{await db.exec('begin'); try {await db.exec('update billing_settings set approved=false'); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[staff.admin]); await db.exec('set local role authenticated'); const draft=await db.query<{id:string}>('select save_sale_draft($1::jsonb,0) id',[JSON.stringify({customer_id:customer,vehicle_id:vehicle,list_price:'10000'})]); await expect(db.query('select issue_sale($1,1,$2)',[draft.rows[0].id,randomUUID()])).rejects.toThrow('not approved');} finally {await db.exec('rollback');}});
  it('calculates balances, makes retries idempotent and rejects overpayments',async()=>{await asStaff(db,staff.admin,async sql=>{const {sale}=await issued(sql); const key=randomUUID(); const result=await sql.query<{id:string}>("select record_payment($1,2000,'bank_transfer','DEPOSIT',$2,null) id",[sale,key]); expect((await sql.query<{id:string}>("select record_payment($1,2000,'bank_transfer','DEPOSIT',$2,null) id",[sale,key])).rows[0].id).toBe(result.rows[0].id); expect((await sql.query<{balance:string}>('select sale_balance($1) balance',[sale])).rows[0].balance).toBe('8000.00'); await expect(sql.query("select record_payment($1,8001,'cash','',$2,null)",[sale,randomUUID()])).rejects.toThrow('Insufficient');});});
  it('credits without rewriting the original and supports a full stock return',async()=>{await asStaff(db,staff.admin,async sql=>{const {sale,invoice}=await issued(sql); const key=randomUUID(); const credit=await sql.query<{id:string}>('select credit_sale($1,10000,\'Returned\',true,$2) id',[sale,key]); expect((await sql.query<{id:string}>('select credit_sale($1,10000,\'Returned\',true,$2) id',[sale,key])).rows[0].id).toBe(credit.rows[0].id); expect((await sql.query<{total:string}>('select total from invoices where id=$1',[invoice])).rows[0].total).toBe('10000.00'); expect((await sql.query<{status:string}>('select status from vehicles where id=$1',[vehicle])).rows[0].status).toBe('available'); expect((await sql.query<{balance:string}>('select sale_balance($1) balance',[sale])).rows[0].balance).toBe('0.00');});});
  it('requires refunding receipts before returning stock',async()=>{await asStaff(db,staff.admin,async sql=>{const {sale}=await issued(sql); await sql.query("select record_payment($1,1000,'cash','',$2,null)",[sale,randomUUID()]); await expect(sql.query("select credit_sale($1,10000,'Returned',true,$2)",[sale,randomUUID()])).rejects.toThrow('Refund payments');});});
  it('limits refunds and blocks ordinary sales staff from payments',async()=>{await asStaff(db,staff.admin,async sql=>{const {sale}=await issued(sql); const payment=await sql.query<{id:string}>("select record_payment($1,1000,'cash','',$2,null) id",[sale,randomUUID()]); await sql.query("select record_payment($1,400,'cash','',$2,$3)",[sale,randomUUID(),payment.rows[0].id]); expect((await sql.query<{balance:string}>('select sale_balance($1) balance',[sale])).rows[0].balance).toBe('9400.00'); await expect(sql.query("select record_payment($1,601,'cash','',$2,$3)",[sale,randomUUID(),payment.rows[0].id])).rejects.toThrow('Refund exceeds');}); await expect(asStaff(db,staff.sales,sql=>sql.query("select record_payment($1,10,'cash','',$2,null)",[randomUUID(),randomUUID()]))).rejects.toThrow('Access denied');});
});
