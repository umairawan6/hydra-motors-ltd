import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {database,asStaff,staff} from './helpers/database';

it('removes an explicit anonymous helper grant while retaining active staff access',async()=>{
  const db=await database('20261014000595');
  try {
    await db.exec('grant execute on function public.is_active() to anon');
    await db.exec(readFileSync('supabase/migrations/20261015000100_auth_helper_privileges.sql','utf8'));
    await expect(asStaff(db,null,sql=>sql.query('select public.is_active()'))).rejects.toThrow('permission denied');
    expect((await asStaff(db,staff.admin,sql=>sql.query<{active:boolean}>('select public.is_active() active'))).rows[0].active).toBe(true);
  } finally {await db.close();}
});
