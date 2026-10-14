import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const baseline = readFileSync('supabase/migrations/20261014000100_baseline.sql', 'utf8');
const access = readFileSync('supabase/migrations/20261014000200_access.sql', 'utf8');
const id = { admin: '10000000-0000-4000-8000-000000000001', manager: '10000000-0000-4000-8000-000000000002', sales: '10000000-0000-4000-8000-000000000003', accountant: '10000000-0000-4000-8000-000000000004', inactive: '10000000-0000-4000-8000-000000000005', other: '10000000-0000-4000-8000-000000000006' };
const customer = '20000000-0000-4000-8000-000000000001';
const vehicle = '30000000-0000-4000-8000-000000000001';
const vehicle2 = '30000000-0000-4000-8000-000000000002';
let db: PGlite;
async function setup(database: PGlite) {
  // Minimal Supabase Auth roles/identity, using real PostgreSQL grants and RLS.
  await database.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
}
async function asUser<T>(user: string | null, query: (database: PGlite) => Promise<T>) {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
    await db.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    return await query(db);
  } finally { await db.exec('rollback'); }
}
beforeAll(async () => {
  db = new PGlite(); await setup(db); await db.exec(baseline); await db.exec(access);
  for (const [role, uuid] of Object.entries(id)) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [uuid, `${role}@example.com`]);
    await db.query('update public.profiles set full_name=$1,role=$2,active=$3 where id=$4', [role, ['inactive', 'other'].includes(role) ? 'sales' : role, role !== 'inactive', uuid]);
  }
  await db.query('insert into public.customers(id,full_name) values($1,$2)', [customer, 'Test customer']);
  await db.query("insert into public.vehicles(id,registration,make,model) values($1,'TEST01','Test','Car'),($2,'TEST02','Test','Car')", [vehicle, vehicle2]);
  await db.query('insert into public.vehicle_costs(vehicle_id,purchase_cost) values($1,7000)', [vehicle]);
  await db.query('insert into public.sales(customer_id,vehicle_id,sale_price,created_by) values($1,$2,10000,$3),($1,$4,9000,$5)', [customer, vehicle, id.sales, vehicle2, id.other]);
  await db.exec("insert into public.invoices(sale_id,invoice_type) select s.id,t.type from public.sales s cross join (values ('customer'),('finance')) t(type)");
  await db.exec("insert into public.payments(sale_id,amount,method,created_by) select id,100,'bank_transfer',created_by from public.sales");
});
afterAll(async () => { await db?.close(); });

describe('migration and database authorization', () => {
  it('preserves starter data and staff activation during upgrade', async () => {
    const old = new PGlite();
    try {
      await setup(old); await old.exec(baseline);
      await old.query('insert into auth.users(id,email) values($1,$2)', [id.admin, 'owner@example.com']);
      await old.query("update public.profiles set role='admin',active=true,full_name='Owner' where id=$1", [id.admin]);
      await old.query('insert into public.customers(id,full_name) values($1,$2)', [customer, 'Existing customer']);
      await old.exec(access);
      const staff = await old.query<{ role: string; active: boolean; email: string }>('select role,active,email from public.profiles');
      expect(staff.rows).toEqual([{ role: 'admin', active: true, email: 'owner@example.com' }]);
      expect((await old.query('select * from public.customers')).rows).toHaveLength(1);
    } finally { await old.close(); }
  });
  it('creates inactive sales profiles without trusting metadata', async () => {
    const uuid = '10000000-0000-4000-8000-000000000007';
    await db.exec('begin');
    try { await db.query('insert into auth.users(id,email) values($1,$2)', [uuid, 'new@example.com']); expect((await db.query<{ role: string; active: boolean }>('select role,active from public.profiles where id=$1', [uuid])).rows).toEqual([{ role: 'sales', active: false }]); }
    finally { await db.exec('rollback'); }
  });
  it('denies unauthenticated direct reads and RPCs', async () => {
    await expect(asUser(null, sql => sql.query('select * from public.customers'))).rejects.toThrow();
    await expect(asUser(null, sql => sql.query('select public.effective_permissions()'))).rejects.toThrow();
  });
  it.each(['profiles','customers','vehicles','vehicle_costs','sales','payments','invoices','roles','permissions','role_permissions','audit_logs'])('hides %s from an inactive account', async table => {
    expect((await asUser(id.inactive, sql => sql.query(`select * from public.${table}`))).rows).toHaveLength(0);
  });
  it.each(['admin','accountant','manager','sales'] as const)('enforces cost access for %s', async role => {
    const rows = (await asUser(id[role], sql => sql.query('select * from public.vehicle_costs'))).rows;
    expect(rows).toHaveLength(['admin','accountant'].includes(role) ? 1 : 0);
  });
  it('restricts sales staff to their own sale records', async () => {
    const own = await asUser(id.sales, sql => sql.query<{ created_by: string }>('select created_by from public.sales'));
    expect(own.rows).toEqual([{ created_by: id.sales }]);
    expect((await asUser(id.manager, sql => sql.query('select * from public.sales'))).rows).toHaveLength(2);
  });
  it('restricts finance invoices to finance permissions and customer invoices to related sales', async () => {
    const sales = await asUser(id.sales, sql => sql.query<{ invoice_type: string }>('select invoice_type from public.invoices'));
    expect(sales.rows).toEqual([{ invoice_type: 'customer' }]);
    expect((await asUser(id.manager, sql => sql.query('select * from public.invoices'))).rows).toHaveLength(2);
    expect((await asUser(id.accountant, sql => sql.query('select * from public.invoices'))).rows).toHaveLength(4);
  });
  it('denies direct role-grant and restricted cost mutations', async () => {
    await expect(asUser(id.admin, sql => sql.query("insert into public.role_permissions values('sales','users.manage')"))).rejects.toThrow();
    await expect(asUser(id.manager, sql => sql.query('insert into public.vehicle_costs(vehicle_id,purchase_cost) values($1,100)', [vehicle2]))).rejects.toThrow();
  });
  it('denies direct profile writes and RPC self-escalation', async () => {
    await expect(asUser(id.sales, sql => sql.query("update public.profiles set role='admin' where id=$1", [id.sales]))).rejects.toThrow();
    await expect(asUser(id.sales, sql => sql.query("select public.set_staff_access($1,'Sales','admin',true)", [id.sales]))).rejects.toThrow('Access denied');
    await expect(asUser(id.admin, sql => sql.query("select public.set_staff_access($1,'Owner','sales',false)", [id.admin]))).rejects.toThrow('own access');
  });
  it('denies permission changes by normal roles and keeps essential admin permissions', async () => {
    await expect(asUser(id.manager, sql => sql.query("select public.set_role_permissions('manager',array['users.manage'])"))).rejects.toThrow('Access denied');
    await expect(asUser(id.admin, sql => sql.query("select public.set_role_permissions('admin',array['stock.read'])"))).rejects.toThrow('cannot be removed');
  });
  it('activates staff and writes an immutable audit entry', async () => {
    await asUser(id.admin, async sql => {
      await sql.query("select public.set_staff_access($1,'Activated staff','manager',true)", [id.inactive]);
      expect((await sql.query<{ active: boolean; role: string }>('select active,role from public.profiles where id=$1', [id.inactive])).rows).toEqual([{ active: true, role: 'manager' }]);
      const log = await sql.query<{ actor_id: string; after_data: { active: boolean } }>("select actor_id,after_data from public.audit_logs where entity_id=$1 and action='update' order by id desc limit 1", [id.inactive]);
      expect(log.rows[0].actor_id).toBe(id.admin); expect(log.rows[0].after_data.active).toBe(true);
    });
    await expect(asUser(id.admin, sql => sql.query('delete from public.audit_logs'))).rejects.toThrow();
  });
  it('updates permissions dynamically and logs role creation', async () => {
    await asUser(id.admin, async sql => {
      await sql.query("select public.create_staff_role('stock_assistant','Stock assistant')");
      await sql.query("select public.set_role_permissions('stock_assistant',array['stock.read'])");
      expect((await sql.query("select permission_key from public.role_permissions where role_key='stock_assistant'")).rows).toEqual([{ permission_key: 'stock.read' }]);
      expect((await sql.query("select * from public.audit_logs where entity='roles' and after_data->>'key'='stock_assistant'")).rows).toHaveLength(1);
    });
  });
  it('deactivation revokes data access without requiring JWT expiry', async () => {
    await db.exec('begin');
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id.admin]); await db.exec('set local role authenticated');
      await db.query("select public.set_staff_access($1,'Sales','sales',false)", [id.sales]);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id.sales]);
      expect((await db.query('select * from public.customers')).rows).toHaveLength(0);
      expect((await db.query<{ permissions: string[] }>('select public.effective_permissions() permissions')).rows[0].permissions).toEqual([]);
    } finally { await db.exec('rollback'); }
  });
  it('keeps financial mutations disabled until transactional workflows exist', async () => {
    await expect(asUser(id.admin, sql => sql.query("update public.sales set status='issued'"))).rejects.toThrow();
    await expect(asUser(id.admin, sql => sql.query('delete from public.invoices'))).rejects.toThrow();
    await expect(asUser(id.admin, sql => sql.query('delete from public.payments'))).rejects.toThrow();
  });
  it('blocks delegated user managers from granting an administrator role', async () => {
    await db.exec('begin');
    try {
      await db.query("insert into public.role_permissions(role_key,permission_key) values('manager','users.manage')");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id.manager]); await db.exec('set local role authenticated');
      await expect(db.query("select public.set_staff_access($1,'Sales','admin',true)", [id.sales])).rejects.toThrow('Cannot grant elevated access');
    } finally { await db.exec('rollback'); }
  });
});
