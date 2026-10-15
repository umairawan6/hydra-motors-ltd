import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {database,asStaff,staff} from './helpers/database';
let db:PGlite;
beforeAll(async()=>{db=await database();});
afterAll(async()=>{await db.close();});
async function transaction(work:()=>Promise<void>) {await db.exec('begin');try{await work();}finally{await db.exec('rollback');}}
const begin=(actor=staff.admin,id=randomUUID(),confirmation='RESET TEST DATA')=>db.query<{job:{id:string;assets:{bucket:string;path:string}[];counts:Record<string,number>;completed_at:string|null}}>('select begin_test_data_reset($1,$2,$3) job',[actor,id,confirmation]);
async function seed() {
  const customer=randomUUID(),vehicle=randomUUID(),photo=randomUUID(),supplier=randomUUID(),attachment=randomUUID();
  await db.query("insert into customers(id,full_name,address) values($1,'Disposable','Test address')",[customer]);
  await db.query("insert into vehicles(id,registration,make,model) values($1,'RESET01','Test','Vehicle')",[vehicle]);
  await db.query('insert into vehicle_costs(vehicle_id,purchase_cost) values($1,7000)',[vehicle]);
  await db.exec("insert into billing_settings(company_name,address,registration_number,terms,approved) values('Keep company','Keep address','KEEP','Keep terms',true)");
  const provider=(await db.query<{id:string}>("insert into finance_providers(full_name,address,email,phone) values('Disposable provider','Test address','','') returning id")).rows[0].id;
  const sale=(await db.query<{id:string}>('select save_sale_draft($1::jsonb,0) id',[JSON.stringify({customer_id:customer,vehicle_id:vehicle,list_price:10000,discount:0,fees:0})])).rows[0].id;
  return {customer,vehicle,photo,sale,supplier,attachment,provider};
}
// Seed business records through their authenticated operations to exercise their audit trail too.
async function asAdmin(work:()=>Promise<void>) {await db.query("select set_config('request.jwt.claim.sub',$1,true)",[staff.admin]);await work();}
describe('admin-only test reset',()=>{
  it('still permits normal photo finalization without granting reset-table access',async()=>{
    await asStaff(db,staff.manager,async sql=>{
      const vehicle=(await sql.query<{id:string}>('select save_vehicle($1::jsonb,0) id',[JSON.stringify({registration:'UPLOAD01',make:'Test',model:'Car',model_year:'2024',mileage:'10000'})])).rows[0].id;
      const photo=randomUUID();await sql.query('insert into vehicle_photos(id,vehicle_id,path) values($1,$2,$3)',[photo,vehicle,vehicle+'/'+photo+'.png']);
      await sql.query('update vehicle_photos set ready=true where id=$1',[photo]);
      expect((await sql.query<{ready:boolean}>('select ready from vehicle_photos where id=$1',[photo])).rows[0].ready).toBe(true);
    });
  });
  it('keeps finalized attachments immutable outside a reset even for the owner',async()=>{
    await expect(transaction(async()=>{await asAdmin(async()=>{const fixture=await seed();await db.query('insert into vehicle_photos(id,vehicle_id,path,ready) values($1,$2,$3,true)',[fixture.photo,fixture.vehicle,fixture.vehicle+'/'+fixture.photo+'.png']);await db.exec('update test_reset_control set enabled=true');await db.exec('delete from vehicle_photos');});})).rejects.toThrow('immutable');
  });
  it.each([staff.admin,staff.manager,staff.sales,staff.accountant,null])('denies direct browser-role execution for %s',async actor=>{
    await expect(asStaff(db,actor,()=>begin(staff.admin))).rejects.toThrow('permission denied');
  });
  it('defaults to disabled even for a confirmed administrator',async()=>{await expect(transaction(async()=>{await begin();})).rejects.toThrow('disabled');});
  it('requires the literal confirmation',async()=>{await expect(transaction(async()=>{await db.exec('update test_reset_control set enabled=true');await begin(staff.admin,randomUUID(),'reset');})).rejects.toThrow('exactly');});
  it.each([staff.manager,staff.inactive])('rejects a non-admin actor despite privileged transport: %s',async actor=>{await expect(transaction(async()=>{await db.exec('update test_reset_control set enabled=true');await begin(actor);})).rejects.toThrow('Administrator');});
  it('atomically clears test records, preserves access/settings/counters and retries safely',async()=>{
    await transaction(async()=>{await asAdmin(async()=>{
      const fixture=await seed();
      const invoice=(await db.query<{id:string}>('select issue_sale($1,1,$2) id',[fixture.sale,randomUUID()])).rows[0].id;
      const finance=(await db.query<{id:string}>("select create_finance_invoice($1,$2,4000,'2026-10-21',$3) id",[fixture.sale,fixture.provider,randomUUID()])).rows[0].id;
      await db.query("select settle_finance_invoice($1,1000,'TEST',$2)",[finance,randomUUID()]);
      await db.query("select record_payment($1,100,'cash','TEST',$2,null)",[fixture.sale,randomUUID()]);
      const bill=(await db.query<{id:string}>('select create_supplier_invoice($1::jsonb,$2) id',[JSON.stringify({supplier_name:'Disposable supplier',supplier_address:'Test address',supplier_reference:'TEST',total:500,invoice_date:'2026-10-15',due_date:'2026-10-21',description:'Test',vehicle_id:fixture.vehicle,cost_treatment:'additional'}),randomUUID()])).rows[0].id;
      await db.query("select record_supplier_payment($1,500,'cash','TEST',$2,null)",[bill,randomUUID()]);
      const photoPath=fixture.vehicle+'/'+fixture.photo+'.png';const attachmentPath=bill+'/'+fixture.attachment+'.pdf';
      await db.query('insert into vehicle_photos(id,vehicle_id,path,ready) values($1,$2,$3,true)',[fixture.photo,fixture.vehicle,photoPath]);
      await db.query('insert into supplier_documents(id,invoice_id,path,ready) values($1,$2,$3,true)',[fixture.attachment,bill,attachmentPath]);
      const path=fixture.sale+'/'+invoice+'.pdf';
      await db.query("insert into storage.objects(bucket_id,name) values('invoice-pdfs',$1)",[path]);
      await db.query("insert into storage.objects(bucket_id,name) values('vehicle-photos',$1),('supplier-documents',$2)",[photoPath,attachmentPath]);
      const before=(await db.query<{count:number}>('select count(*)::integer count from profiles')).rows[0].count;
      await db.exec('update test_reset_control set enabled=true');
      const request=randomUUID();await db.exec('set local role service_role');
      const job=(await begin(staff.admin,request)).rows[0].job;
      expect(job.counts).toMatchObject({customers:1,vehicles:1,sales:1,invoices:2,payments:2,supplier_invoices:1,supplier_payments:1});
      expect(job.assets).toContainEqual({bucket:'invoice-pdfs',path});
      await db.exec('reset role');
      for(const table of ['customers','vehicles','vehicle_costs','sales','payments','invoices','finance_providers','finance_invoices','finance_settlements','supplier_invoices','supplier_payments','supplier_documents','vehicle_photos']) expect((await db.query('select * from '+table)).rows).toHaveLength(0);
      expect((await db.query('select * from profiles')).rows).toHaveLength(before);
      expect((await db.query<{company_name:string}>('select company_name from billing_settings')).rows[0].company_name).toBe('Keep company');
      expect((await db.query('select * from roles')).rows).toHaveLength(4);
      expect((await db.query('select * from invoice_sequences')).rows.length).toBeGreaterThan(0);
      expect((await db.query("select * from audit_logs where entity='customers'")).rows).toHaveLength(0);
      expect((await db.query("select * from audit_logs where action='reset_started'")).rows).toHaveLength(1);
      await db.query("insert into customers(full_name) values('Created after reset')");
      expect((await begin(staff.admin,randomUUID())).rows[0].job.id).toBe(request);
      expect((await db.query('select * from customers')).rows).toHaveLength(1);
      // Simulate the external Storage API in the embedded fixture, never in live SQL.
      await db.exec('delete from storage.objects');
      await db.query('select complete_test_data_reset($1,$2)',[staff.admin,request]);
      const repeated=(await begin(staff.admin,request)).rows[0].job;
      expect(repeated.completed_at).not.toBeNull();expect(repeated.assets).toEqual([]);
      expect((await db.query('select * from customers')).rows).toHaveLength(1);
    });});
  });
  it('does not declare completion while any captured Storage object remains',async()=>{
    await expect(transaction(async()=>{await db.exec('update test_reset_control set enabled=true');await db.exec("insert into storage.objects(bucket_id,name) values('invoice-pdfs','orphan-test.pdf')");const job=(await begin()).rows[0].job;await db.query('select complete_test_data_reset($1,$2)',[staff.admin,job.id]);})).rejects.toThrow('cleanup');
  });
});
