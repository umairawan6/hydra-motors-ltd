import {afterAll,beforeAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {database,asStaff,staff} from './helpers/database';
import {renderInvoice,invoiceSnapshotSchema} from '../lib/invoices/document';
import {reportSchema,reportCsv} from '../lib/reports';
let db:PGlite;
beforeAll(async()=>{db=await database();});
afterAll(async()=>await db?.close());
it('accepts one complete stock-to-sale-to-receipt-to-PDF-to-report story in an isolated database',async()=>{
  await asStaff(db,staff.admin,async sql=>{
    await sql.query('select save_billing_settings($1::jsonb)',[JSON.stringify({company_name:'Hydra workflow TEST ONLY',address:'123 Test Road',registration_number:'TEST-ONLY',terms:'Fictitious acceptance fixture.',approved:true})]);
    const customer=(await sql.query<{id:string}>('select save_customer($1::jsonb,0) id',[JSON.stringify({full_name:'Acceptance TEST customer',address:'Test address',email:'test@example.com'})])).rows[0].id;
    const vehicle=(await sql.query<{id:string}>('select save_vehicle($1::jsonb,0) id',[JSON.stringify({registration:'TEST FLOW',make:'Example',model:'Test car',model_year:'2024',mileage:'10000'})])).rows[0].id;
    await sql.query('select save_vehicle_costs($1,7000,500,0,0)',[vehicle]);
    const sale=(await sql.query<{id:string}>('select save_sale_draft($1::jsonb,0) id',[JSON.stringify({customer_id:customer,vehicle_id:vehicle,list_price:'10000'})])).rows[0].id;
    const issueKey=randomUUID();
    const invoice=(await sql.query<{id:string}>('select issue_sale($1,1,$2) id',[sale,issueKey])).rows[0].id;
    expect((await sql.query<{id:string}>('select issue_sale($1,1,$2) id',[sale,issueKey])).rows[0].id).toBe(invoice);
    const paymentKey=randomUUID();
    const payment=(await sql.query<{id:string}>("select record_payment($1,2000,'bank_transfer','TEST receipt',$2,null) id",[sale,paymentKey])).rows[0].id;
    expect((await sql.query<{id:string}>("select record_payment($1,2000,'bank_transfer','TEST receipt',$2,null) id",[sale,paymentKey])).rows[0].id).toBe(payment);
    expect((await sql.query<{balance:string}>('select sale_balance($1) balance',[sale])).rows[0].balance).toBe('8000.00');
    expect((await sql.query<{status:string}>('select status from vehicles where id=$1',[vehicle])).rows[0].status).toBe('sold');
    const stored=(await sql.query<{snapshot:unknown}>('select snapshot from invoices where id=$1',[invoice])).rows[0].snapshot;
    const snapshot=invoiceSnapshotSchema.parse(stored);expect(snapshot.vehicle.registration).toBe('TESTFLOW');expect(snapshot.total).toBe(10000);
    const bytes=await renderInvoice(snapshot);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
    mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/workflow-acceptance.pdf',bytes);
    const day=snapshot.supply_date;
    const report=reportSchema.parse((await sql.query<{r:unknown}>('select sales_profit_report($1::date,$1::date) r',[day])).rows[0].r);
    expect(report.summary).toMatchObject({sales_count:1,revenue:10000,cash:2000,cost:7500,profit:2500});expect(report.outstanding).toBe(8000);
    expect(reportCsv(report)).toContain('"10000","0","10000","2000","7500","0","0","2500"');
    // Subsequent edits must not alter the issued document snapshot.
    await sql.query('select save_customer($1::jsonb,1)',[JSON.stringify({id:customer,full_name:'Changed TEST customer',address:'Changed address'})]);
    expect((await sql.query<{snapshot:unknown}>('select snapshot from invoices where id=$1',[invoice])).rows[0].snapshot).toEqual(stored);
  });
  // The whole fixture rolls back: tests do not touch a configured cloud database.
  expect((await db.query('select id from sales')).rows).toHaveLength(0);
});
