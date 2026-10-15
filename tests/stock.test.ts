import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {database,asStaff,staff} from './helpers/database';
import {fileKind} from '../lib/business/files';
let db:PGlite;
const vehicle='30000000-0000-4000-8000-000000000001'; const customer='20000000-0000-4000-8000-000000000001';
beforeAll(async()=>{db=await database('20261014000350'); await db.query("insert into public.customers(id,full_name) values($1,'Customer')",[customer]); await db.query("insert into public.vehicles(id,registration,make,model) values($1,'TEST01','Test','Car')",[vehicle]);});
afterAll(async()=>await db?.close());
describe('stock workflows',()=>{
  it('archives and restores stock without deleting costs and rejects stale removal',async()=>{
    await asStaff(db,staff.admin,async sql=>{
      const payload={id:vehicle,registration:'TEST01',make:'Test',model:'Car',status:'archived'};
      await sql.query('select save_vehicle_costs($1,7000,100,0,0)',[vehicle]);
      await sql.query('select save_vehicle($1::jsonb,1)',[JSON.stringify(payload)]);
      expect((await sql.query<{status:string}>('select status from vehicles where id=$1',[vehicle])).rows[0].status).toBe('archived');
      expect((await sql.query('select id from vehicles where id=$1',[vehicle])).rows).toHaveLength(1);
      expect(Number((await sql.query<{purchase_cost:string}>('select purchase_cost from vehicle_costs where vehicle_id=$1',[vehicle])).rows[0].purchase_cost)).toBe(7000);
      await sql.query('select save_vehicle($1::jsonb,2)',[JSON.stringify({...payload,status:'available'})]);
      expect((await sql.query<{status:string}>('select status from vehicles where id=$1',[vehicle])).rows[0].status).toBe('available');
      await expect(sql.query('select save_vehicle($1::jsonb,1)',[JSON.stringify(payload)])).rejects.toThrow('Record changed');
    });
  });
  it('persists customer changes and detects a stale edit',async()=>{
    await asStaff(db,staff.sales,async sql=>{await sql.query("select public.save_customer($1::jsonb,1)",[JSON.stringify({id:customer,full_name:'Changed',archived:true})]); expect((await sql.query<{version:number;archived:boolean}>('select version,archived from customers where id=$1',[customer])).rows).toEqual([{version:2,archived:true}]); await expect(sql.query("select public.save_customer($1::jsonb,1)",[JSON.stringify({id:customer,full_name:'Stale'})])).rejects.toThrow('Record changed');});
  });
  it('keeps creation across separate requests',async()=>{
    const result=await asStaff(db,staff.sales,sql=>sql.query<{id:string}>('select public.save_customer($1::jsonb,0) id',[JSON.stringify({full_name:'Persistent customer'})]),true);
    expect((await asStaff(db,staff.sales,sql=>sql.query('select id from customers where id=$1',[result.rows[0].id]))).rows).toHaveLength(1);
  });
  it('prevents manually marking stock sold and normalized duplicate registrations',async()=>{
    await expect(asStaff(db,staff.manager,sql=>sql.query('select public.save_vehicle($1::jsonb,0)',[JSON.stringify({registration:'test 01',make:'Test',model:'Car'})]))).rejects.toThrow('duplicate');
    await expect(asStaff(db,staff.sales,sql=>sql.query('select public.save_vehicle($1::jsonb,1)',[JSON.stringify({id:vehicle,registration:'TEST01',make:'Test',model:'Car',status:'sold'})]))).rejects.toThrow('sold stock');
  });
  it('allows authorized costs and denies stock-only accounts',async()=>{
    await asStaff(db,staff.accountant,async sql=>{await sql.query('select public.save_vehicle_costs($1,7000,500,0,0)',[vehicle]); expect((await sql.query('select purchase_cost from vehicle_costs')).rows).toEqual([{purchase_cost:'7000.00'}]);});
    await expect(asStaff(db,staff.sales,sql=>sql.query('select public.save_vehicle_costs($1,7000,500,0,0)',[vehicle]))).rejects.toThrow('Access denied');
  });
  it('protects photos through storage RLS and rejects unregistered paths',async()=>{
    const photo='40000000-0000-4000-8000-000000000001'; const path=`${vehicle}/${photo}.jpg`;
    await asStaff(db,staff.sales,async sql=>{await sql.query('insert into vehicle_photos(id,vehicle_id,path) values($1,$2,$3)',[photo,vehicle,path]); await sql.query("insert into storage.objects(bucket_id,name) values('vehicle-photos',$1)",[path]); expect((await sql.query('select name from storage.objects')).rows).toHaveLength(1);});
    await expect(asStaff(db,staff.sales,sql=>sql.query("insert into storage.objects(bucket_id,name) values('vehicle-photos','unknown.jpg')"))).rejects.toThrow('row-level security');
  });
  it('denies inactive stock RPCs and direct operational writes',async()=>{
    await expect(asStaff(db,staff.inactive,sql=>sql.query("select public.save_customer('{\"full_name\":\"Denied\"}',0)"))).rejects.toThrow('Access denied');
    await expect(asStaff(db,staff.sales,sql=>sql.query("update vehicles set status='sold'"))).rejects.toThrow('permission denied');
  });
  it('does not accept SVG or misleading MIME contents',()=>{expect(fileKind(new TextEncoder().encode('<svg></svg>'))).toBeNull(); expect(fileKind(new Uint8Array([255,216,255,0]))?.extension).toBe('jpg');});
});
