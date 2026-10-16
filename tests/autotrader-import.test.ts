import {beforeAll,afterAll,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {database,asStaff,staff} from './helpers/database';
import {parseStockCsv,missingVehicleFields,MAX_IMPORT_BYTES} from '../lib/autotrader-import';
let db:PGlite;
beforeAll(async()=>{db=await database();});afterAll(async()=>await db?.close());
async function run(sql:PGlite,rows:unknown) {return (await sql.query<{result:{imported:number;skipped:number}}>('select import_autotrader_drafts($1::jsonb) result',[JSON.stringify(rows)])).rows[0].result;}
const car={stock_id:'at-test-1',registration:'TEST01',make:'Example',model:'Car',model_year:'2024',mileage:'10000',vin:'VIN-TEST'};
it('previews BOM, header aliases, quoted mileage and optional missing fields',()=>{
  const rows=parseStockCsv('\uFEFFStock ID,Reg Number,Make,Model,Year,Mileage,VIN\r\nat-1,ab 12 cde,Example,"Model, variant",2024,"10,000",\r\nat-2,,,,,,');
  expect(rows[0]).toMatchObject({stock_id:'at-1',registration:'AB12CDE',model:'Model, variant',mileage:'10000',vin:''});expect(missingVehicleFields(rows[1])).toEqual(['registration','make','model','model_year','mileage']);
});
it('accepts escaped quotes and newlines within quoted CSV fields',()=>{
  const rows=parseStockCsv('stock_id,model\nat-1,"Variant ""A""\nEdition"');expect(rows[0].model).toBe('Variant "A"\nEdition');
});
it.each(['reg,registration\nA,B','hello,unknown\na,b','registration,year\nTEST1,1800','registration,mileage\nTEST1,-1','make,model\nExample,Car','registration,model\nTEST1,"Unclosed','registration,model\nTEST1,"Closed"extra','registration,model\nTEST1,Car,extra'])('rejects invalid CSV %s',input=>{expect(()=>parseStockCsv(input)).toThrow();});
it('limits batch rows and bytes',()=>{expect(()=>parseStockCsv('registration\n'+Array.from({length:201},(_,n)=>`TEST${n}`).join('\n'))).toThrow('200');expect(()=>parseStockCsv('x'.repeat(MAX_IMPORT_BYTES+1))).toThrow('1 MB');});
it('imports incomplete authorized stock as drafts and ignores forged status/IDs/costs',async()=>{await asStaff(db,staff.admin,async sql=>{
  expect(await run(sql,[{stock_id:'at-only',status:'available',id:staff.admin,purchase_cost:10000}])).toEqual({imported:1,skipped:0});
  expect((await sql.query('select autotrader_stock_id,status,registration,make from vehicles')).rows).toEqual([{autotrader_stock_id:'at-only',status:'draft',registration:null,make:null}]);
  expect((await sql.query('select * from vehicle_costs')).rows).toHaveLength(0);
});});
it('skips repeated IDs/normalized registrations/VINs without overwriting existing data',async()=>{await asStaff(db,staff.manager,async sql=>{
  expect(await run(sql,[car])).toEqual({imported:1,skipped:0});
  expect(await run(sql,[{...car,make:'Changed'},{...car,stock_id:'new-id',registration:'test 01',vin:''},{...car,stock_id:'another-id',registration:'DIFFERENT'}])).toEqual({imported:0,skipped:3});
  expect((await sql.query<{make:string}>('select make from vehicles')).rows[0].make).toBe('Example');
});});
it('rolls back the complete batch if a later row is invalid',async()=>{
  await expect(asStaff(db,staff.admin,sql=>run(sql,[car,{stock_id:'bad-year',model_year:'wrong'}]))).rejects.toThrow();
  expect((await db.query('select id from vehicles')).rows).toHaveLength(0);
});
it.each([staff.accountant,staff.inactive,null])('denies unpermitted imports for %s',async user=>{await expect(asStaff(db,user,sql=>run(sql,[car]))).rejects.toThrow();});
it('requires read as well as write permission and rejects unidentified rows',async()=>{
  await db.exec('begin');try{await db.exec("delete from role_permissions where role_key='sales' and permission_key='stock.read'");await db.query("select set_config('request.jwt.claim.sub',$1,true)",[staff.sales]);await db.exec('set local role authenticated');await expect(run(db,[car])).rejects.toThrow('Access denied');}finally{await db.exec('rollback');}
  await expect(asStaff(db,staff.admin,sql=>run(sql,[{make:'Unidentified'}]))).rejects.toThrow('requires a stock ID');
});

it('imports advertised prices and gearboxes without creating restricted costs',async()=>{await asStaff(db,staff.admin,async sql=>{
  const rows=parseStockCsv('stock_id,price,gearbox\nat-price,"£12,250.50",Auto');
  expect(rows[0]).toMatchObject({asking_price:'12250.50',gearbox:'automatic'});
  await run(sql,rows);
  expect((await sql.query('select asking_price::text,gearbox,status from vehicles')).rows).toEqual([{asking_price:'12250.50',gearbox:'automatic',status:'draft'}]);
  expect((await sql.query('select * from vehicle_costs')).rows).toHaveLength(0);
});});
it.each(['-1','1.001','NaN','10000000000'])('rejects invalid imported price %s',async price=>{
  expect(()=>parseStockCsv(`stock_id,price\nat-invalid,${price}`)).toThrow();
  await expect(asStaff(db,staff.admin,sql=>run(sql,[{stock_id:'at-invalid',asking_price:price}]))).rejects.toThrow();
});
it('rejects unrecognized gearbox through CSV and direct RPC',async()=>{
  expect(()=>parseStockCsv('stock_id,gearbox\nat-invalid,unknown')).toThrow();
  await expect(asStaff(db,staff.admin,sql=>run(sql,[{stock_id:'at-invalid',gearbox:'unknown'}]))).rejects.toThrow();
});
it('preserves stock price and gearbox when archiving with an older payload',async()=>{await asStaff(db,staff.admin,async sql=>{
  await run(sql,[{stock_id:'at-preserve',asking_price:'8250',gearbox:'manual'}]);
  const id=(await sql.query<{id:string}>('select id from vehicles')).rows[0].id;
  await sql.query('select save_vehicle($1::jsonb,1)',[JSON.stringify({id,status:'archived'})]);
  expect((await sql.query('select asking_price::text,gearbox from vehicles')).rows[0]).toEqual({asking_price:'8250.00',gearbox:'manual'});
});});
