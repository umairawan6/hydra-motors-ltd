import { redirect } from 'next/navigation';
import { AuthCard } from '../../components/auth-card';
import { publicSupabaseConfig } from '../../lib/env';
import { supabaseServer } from '../../lib/supabase/server';
import { logout } from '../login/actions';
export default async function AccessPending() {
  if (!publicSupabaseConfig()) redirect('/setup');
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  return <AuthCard title="Access pending" description="An administrator needs to activate your staff account. If access was removed, contact your administrator."><form action={logout}><button className="button secondary">Sign out</button></form></AuthCard>;
}
