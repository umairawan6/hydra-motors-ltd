import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
export const staff={admin:'10000000-0000-4000-8000-000000000001',manager:'10000000-0000-4000-8000-000000000002',sales:'10000000-0000-4000-8000-000000000003',accountant:'10000000-0000-4000-8000-000000000004',inactive:'10000000-0000-4000-8000-000000000005'};
export async function database(last='99999999999999') {
  const db=new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema auth,storage,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  for(const name of readdirSync('supabase/migrations').sort().filter(name=>name.endsWith('.sql') && name.slice(0,14)<=last)) await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
  for(const [role,id] of Object.entries(staff)) {
    await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${role}@example.com`]);
    await db.query('update public.profiles set role=$1,active=$2 where id=$3',[role==='inactive' ? 'sales' : role,role!=='inactive',id]);
  }
  return db;
}
export async function asStaff<T>(db:PGlite,id:string|null,work:(db:PGlite)=>Promise<T>,commit=false) {
  await db.exec('begin'); try { await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id ?? '']); await db.exec(`set local role ${id ? 'authenticated' : 'anon'}`); const result=await work(db); await db.exec(commit ? 'commit' : 'rollback'); return result; }
  catch(error) {await db.exec('rollback'); throw error;}
}
