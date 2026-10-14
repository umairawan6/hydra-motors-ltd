'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '../../../lib/auth/session';
import { isPermission } from '../../../lib/auth/permissions';
import { roleSchema, type ActionState } from '../../../lib/validation';
export async function createRole(_state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireStaff('roles.manage');
  const parsed = roleSchema.safeParse({ key: form.get('key'), name: form.get('name') });
  if (!parsed.success) return { error: 'Use a 2–32 character lowercase role key and a 2–60 character name.' };
  const { error } = await db.rpc('create_staff_role', { role_key: parsed.data.key, role_name: parsed.data.name });
  if (error) return { error: error.code === '23505' ? 'That role key already exists.' : 'Unable to create role. Refresh and check your access.' };
  revalidatePath('/dashboard', 'layout'); return { success: 'Role created with no permissions. Configure it below before assigning staff.' };
}
export async function updateRolePermissions(_state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireStaff('roles.manage');
  const role = form.get('role'); const permissions = form.getAll('permissions');
  if (typeof role !== 'string' || !/^[a-z][a-z0-9_]{1,31}$/.test(role) || permissions.some(value => typeof value !== 'string' || !isPermission(value))) return { error: 'Invalid role or permissions.' };
  const { error } = await db.rpc('set_role_permissions', { target_role: role, requested_permissions: permissions as string[] });
  if (error) { const safe = ['Administrator access controls cannot be removed', 'Cannot grant elevated access']; return { error: safe.find(message => error.message.includes(message)) || 'Unable to save permissions. Refresh and check your access.' }; }
  revalidatePath('/dashboard', 'layout'); return { success: 'Role permissions updated.' };
}
