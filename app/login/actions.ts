'use server';
import { redirect } from 'next/navigation';
import { supabaseServer } from '../../lib/supabase/server';
import { publicSupabaseConfig, siteUrl } from '../../lib/env';
import { loginSchema, emailSchema, passwordSchema, type ActionState } from '../../lib/validation';
export async function login(_state: ActionState, form: FormData): Promise<ActionState> {
  if (!publicSupabaseConfig()) return { error: 'Connect Supabase first. See the setup page.' };
  const parsed = loginSchema.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: 'Enter a valid email and password.' };
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'Unable to sign in. Check your credentials or try again shortly.' };
  redirect('/dashboard');
}
export async function logout() {
  if (publicSupabaseConfig()) { const db = await supabaseServer(); const { error } = await db.auth.signOut({ scope: 'local' }); if (error) throw new Error('Unable to sign out. Please retry.'); }
  redirect('/login');
}
export async function requestPasswordReset(_state: ActionState, form: FormData): Promise<ActionState> {
  const email = emailSchema.safeParse(form.get('email'));
  if (!email.success) return { error: 'Enter a valid email address.' };
  if (!publicSupabaseConfig()) return { error: 'Supabase is not configured.' };
  const db = await supabaseServer();
  const { error } = await db.auth.resetPasswordForEmail(email.data, { redirectTo: `${siteUrl()}/auth/callback?next=/update-password` });
  if (error) return { error: 'Unable to request a reset link. Please try again later.' };
  return { success: 'If an account exists, a reset link has been sent. Check your inbox.' };
}
export async function updatePassword(_state: ActionState, form: FormData): Promise<ActionState> {
  const parsed = passwordSchema.safeParse({ password: form.get('password'), confirmation: form.get('confirmation') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: 'Your link expired. Request a new link.' };
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: 'Unable to save your password. Try a new link or a different password.' };
  const { error: signOutError } = await db.auth.signOut({ scope: 'local' });
  if (signOutError) return { success: 'Password saved. Sign out and sign in again.' };
  redirect('/login?notice=password-updated');
}
