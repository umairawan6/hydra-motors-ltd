import {afterAll,beforeAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {database,asStaff,staff} from './helpers/database';
import {vehicleSchema} from '../lib/business/validation';
let db:PGlite;
beforeAll(async()=>{db=await database();});afterAll(async()=>await db?.close());
const complete={registration:'DRAFT 01',make:'Example',model:'Car',model_year:'2024',mileage:'0',vin:'',purchase_date:''};
async function save(sql:PGlite,payload:object,version=0) {return (await sql.query<{id:string}>('select save_vehicle($1::jsonb,$2) id',[JSON.stringify(payload),version])).rows[0].id;}
it('stores multiple incomplete imports as drafts with null missing identity fields',async()=>{await asStaff(db,staff.admin,async sql=>{
  const first=await save(sql,{status:'draft'}),second=await save(sql,{status:'draft',make:'Known make'});
  expect(first).not.toBe(second);expect((await sql.query('select registration,make,model,model_year,mileage,status from vehicles where id=$1',[first])).rows).toEqual([{registration:null,make:null,model:null,model_year:null,mileage:null,status:'draft'}]);
});});
it.each(['registration','make','model','model_year','mileage'])('rejects draft activation when %s is absent',async field=>{
  await expect(asStaff(db,staff.admin,async sql=>{const id=await save(sql,{status:'draft'});await save(sql,{...complete,[field]:'',id,status:'available'},1);})).rejects.toThrow('Complete registration');
});
it('activates a complete draft with optional VIN and zero mileage, preserving record identity',async()=>{await asStaff(db,staff.admin,async sql=>{
  const id=await save(sql,{status:'draft'});expect(await save(sql,{...complete,id,status:'available'},1)).toBe(id);
  expect((await sql.query('select registration,vin,status,version,mileage from vehicles where id=$1',[id])).rows).toEqual([{registration:'DRAFT01',vin:null,status:'available',version:2,mileage:0}]);
  expect((await sql.query("select id from vehicles where status in ('available','reserved')")).rows).toHaveLength(1);
});});
it('does not allow draft vehicles into sale drafts through direct RPC calls',async()=>{await expect(asStaff(db,staff.admin,async sql=>{
  const vehicle=await save(sql,{...complete,status:'draft'});const customer=(await sql.query<{id:string}>("select save_customer('{\"full_name\":\"Test\",\"address\":\"Address\"}',0) id")).rows[0].id;
  await sql.query('select save_sale_draft($1::jsonb,0)',[JSON.stringify({customer_id:customer,vehicle_id:vehicle,list_price:'10000'})]);
})).rejects.toThrow('Vehicle is not available');});
it('detects stale draft edits and retains normalized uniqueness for known registrations',async()=>{
  await expect(asStaff(db,staff.admin,async sql=>{const id=await save(sql,{...complete,status:'draft'});await save(sql,{id,status:'draft'},1);await save(sql,{id,status:'draft'},1);})).rejects.toThrow('Record changed');
  await expect(asStaff(db,staff.admin,async sql=>{await save(sql,{...complete,status:'draft'});await save(sql,{registration:'draft01',status:'draft'});})).rejects.toThrow('duplicate');
});
it('archives and restores incomplete drafts without requiring fabricated identity values',async()=>{await asStaff(db,staff.admin,async sql=>{
  const id=await save(sql,{status:'draft'});await save(sql,{id,status:'archived'},1);await save(sql,{id,status:'draft'},2);
  expect((await sql.query<{status:string}>('select status from vehicles where id=$1',[id])).rows[0].status).toBe('draft');
});});
it.each([staff.accountant,staff.inactive,null])('retains write permission checks for %s',async user=>{await expect(asStaff(db,user,sql=>save(sql,{status:'draft'}))).rejects.toThrow();});
it('validates optional draft fields but requires complete active stock in application forms',()=>{
  const empty={registration:'',make:'',model:'',vin:'',model_year:'',mileage:'',purchase_date:'',status:'draft'};
  expect(vehicleSchema.safeParse(empty).success).toBe(true);expect(vehicleSchema.safeParse({...empty,status:'available'}).success).toBe(false);
  expect(vehicleSchema.safeParse({...empty,mileage:'-1'}).success).toBe(false);expect(vehicleSchema.safeParse({...complete,status:'available'}).success).toBe(true);
});
