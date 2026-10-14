import { redirect } from 'next/navigation';
import { AuthCard } from '../../components/auth-card';
import { AuthForm } from '../../components/auth-form';
import { publicSupabaseConfig } from '../../lib/env';
import { supabaseServer } from '../../lib/supabase/server';
export default async function UpdatePassword() {
  if (!publicSupabaseConfig()) redirect('/setup');
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login?error=link');
  return <AuthCard title="Set your password" description="Choose a password for your staff account."><AuthForm mode="password" /></AuthCard>;
}
