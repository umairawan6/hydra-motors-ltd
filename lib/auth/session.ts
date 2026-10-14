import 'server-only';
import { redirect } from 'next/navigation';
import { publicSupabaseConfig } from '../env';
import { supabaseServer } from '../supabase/server';
import { can, type Permission } from './permissions';
export async function requireStaff(permission?: Permission) {
  if (!publicSupabaseConfig()) redirect('/setup');
  const db = await supabaseServer();
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) redirect('/login');
  const { data: profile, error } = await db.from('profiles').select('id,full_name,email,role,active').eq('id', user.id).maybeSingle();
  if (error) throw new Error('Unable to verify staff access. Check database migrations and connection.');
  if (!profile?.active) redirect('/access-pending');
  const { data: permissions, error: permissionError } = await db.rpc('effective_permissions');
  if (permissionError) throw new Error('Unable to load permissions. Apply the access migration.');
  const granted = permissions ?? [];
  if (permission && !can(granted, permission)) redirect('/dashboard?notice=forbidden');
  return { db, user, profile, permissions: granted };
}
