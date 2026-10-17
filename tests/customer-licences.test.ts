import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {PGlite} from '@electric-sql/pglite';
import {database,asStaff,staff} from './helpers/database';
let db:PGlite;const customer=randomUUID();
beforeAll(async()=>{db=await database();await db.query("insert into customers(id,full_name) values($1,'Synthetic licence fixture')",[customer]);});
afterAll(async()=>await db?.close());
async function prepare(sql:PGlite,side='front') {
 const id=randomUUID(),path=`${customer}/${id}.png`;
 await sql.query('insert into customer_licence_images(id,customer_id,side,path) values($1,$2,$3,$4)',[id,customer,side,path]);return {id,path};
}
it('permits separate front/back uploads, private reads and removal for an administrator',async()=>{await asStaff(db,staff.admin,async sql=>{
 const front=await prepare(sql);await prepare(sql,'back');
 await sql.query("insert into storage.objects(bucket_id,name) values('customer-licences',$1)",[front.path]);
 await sql.query('update customer_licence_images set ready=true where id=$1',[front.id]);
 expect((await sql.query("select name from storage.objects where bucket_id='customer-licences'")).rows).toEqual([{name:front.path}]);
 expect((await sql.query('select id from customer_licence_images')).rows).toHaveLength(2);
 await sql.query("delete from storage.objects where bucket_id='customer-licences' and name=$1",[front.path]);
 await sql.query('delete from customer_licence_images where id=$1',[front.id]);
 expect((await sql.query('select side from customer_licence_images')).rows).toEqual([{side:'back'}]);
});});
it.each([staff.sales,staff.manager,staff.accountant,staff.inactive,null])('denies licence metadata and upload for ordinary role %s',async user=>{
 await asStaff(db,staff.admin,async sql=>{const image=await prepare(sql);await sql.query("insert into storage.objects(bucket_id,name) values('customer-licences',$1)",[image.path]);await sql.query('update customer_licence_images set ready=true where id=$1',[image.id]);},true);
 await expect(asStaff(db,user,sql=>prepare(sql))).rejects.toThrow();
 if(user) await asStaff(db,user,async sql=>{expect((await sql.query('select id from customer_licence_images')).rows).toHaveLength(0);expect((await sql.query("select name from storage.objects where bucket_id='customer-licences'")).rows).toHaveLength(0);});
 await db.exec('delete from storage.objects;delete from customer_licence_images');
});
it('prevents path spoofing, duplicate sides and unsupported sides',async()=>{
 await expect(asStaff(db,staff.admin,sql=>sql.query('insert into customer_licence_images(id,customer_id,side,path) values($1,$2,$3,$4)',[randomUUID(),customer,'front','another-customer/file.png']))).rejects.toThrow();
 await expect(asStaff(db,staff.admin,async sql=>{await prepare(sql);await prepare(sql);})).rejects.toThrow();
 await expect(asStaff(db,staff.admin,sql=>prepare(sql,'other'))).rejects.toThrow();
});
it('denies immutable path/owner changes and uploads without matching metadata',async()=>{
 await expect(asStaff(db,staff.admin,async sql=>{const image=await prepare(sql);await sql.query("update customer_licence_images set customer_id=$1 where id=$2",[randomUUID(),image.id]);})).rejects.toThrow();
 await expect(asStaff(db,staff.admin,sql=>sql.query("insert into storage.objects(bucket_id,name) values('customer-licences','untracked.png')"))).rejects.toThrow();
});
it('allows explicit read-only delegation but denies uploads and immediately respects revocation',async()=>{
 await db.exec('begin');try{
  await db.query("insert into role_permissions values('manager','customers.licence_read')");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[staff.admin]);await db.exec('set local role authenticated');
  const image=await prepare(db);await db.query("insert into storage.objects(bucket_id,name) values('customer-licences',$1)",[image.path]);await db.query('update customer_licence_images set ready=true where id=$1',[image.id]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[staff.manager]);
  expect((await db.query('select id from customer_licence_images')).rows).toHaveLength(1);
  expect((await db.query("select name from storage.objects where bucket_id='customer-licences'")).rows).toHaveLength(1);
  await db.exec('savepoint denied_upload');await expect(prepare(db,'back')).rejects.toThrow();await db.exec('rollback to savepoint denied_upload');
  await db.exec('reset role');await db.exec("delete from role_permissions where role_key='manager' and permission_key='customers.licence_read'");await db.exec('set local role authenticated');
  expect((await db.query('select id from customer_licence_images')).rows).toHaveLength(0);
 }finally{await db.exec('rollback');}
});
it('includes licence assets in authorized reset cleanup without executing a live reset',async()=>{
 await db.exec('begin');try{
  const imageId=randomUUID(),path=`${customer}/${imageId}.png`;
  await db.query('insert into customer_licence_images(id,customer_id,side,path) values($1,$2,$3,$4)',[imageId,customer,'front',path]);
  await db.exec('update test_reset_control set enabled=true where id=1');
  const job=(await db.query<{job:{assets:{bucket:string;path:string}[]}}>("select begin_test_data_reset($1,$2,'RESET TEST DATA') job",[staff.admin,randomUUID()])).rows[0].job;
  expect(job.assets).toContainEqual({bucket:'customer-licences',path});
  expect((await db.query('select id from customer_licence_images')).rows).toHaveLength(0);
 }finally{await db.exec('rollback');}
});
