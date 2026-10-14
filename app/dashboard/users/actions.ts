'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '../../../lib/auth/session';
import { supabaseAdmin } from '../../../lib/supabase/admin';
import { siteUrl } from '../../../lib/env';
import { emailSchema, staffAccessSchema, type ActionState } from '../../../lib/validation';

export async function inviteStaff(_state: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff('users.manage');
  const email = emailSchema.safeParse(form.get('email'));
  if (!email.success || form.get('confirm') !== 'on') return { error: 'Enter a valid email and confirm that you want to send an invitation.' };
  if (!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return { error: 'Configure the server-only Supabase secret key to send invitations.' };
  const db = supabaseAdmin();
  const { error } = await db.auth.admin.inviteUserByEmail(email.data, { redirectTo: `${siteUrl()}/auth/confirm` });
  if (error) return { error: 'Invitation was not sent. The account may already exist, or email delivery may be unavailable. Check Supabase Auth.' };
  revalidatePath('/dashboard/users');
  return { success: 'Invitation sent. The account is inactive: assign a role and activate it below.' };
}

export async function updateStaffAccess(_state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireStaff('users.manage');
  const parsed = staffAccessSchema.safeParse({ id: form.get('id'), fullName: form.get('fullName'), role: form.get('role'), active: form.get('active') === 'on' });
  if (!parsed.success) return { error: 'Enter a name and a valid role.' };
  const { error } = await db.rpc('set_staff_access', { target_id: parsed.data.id, target_name: parsed.data.fullName, target_role: parsed.data.role, target_active: parsed.data.active });
  if (error) {
    const safe = ['Ask another administrator to change your own access', 'Keep at least one active administrator', 'Cannot grant elevated access', 'Unknown role', 'Staff account not found'];
    return { error: safe.find(message => error.message.includes(message)) || 'Access could not be updated. Refresh and check your permissions.' };
  }
  revalidatePath('/dashboard', 'layout');
  return { success: 'Staff access updated.' };
}
