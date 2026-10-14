import Link from 'next/link';
import { AuthCard } from '../../components/auth-card';
import { AuthForm } from '../../components/auth-form';
import { publicSupabaseConfig } from '../../lib/env';
export default async function Login({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthCard title="Welcome back" description="Sign in to your Hydra Motors workspace.">
    {!publicSupabaseConfig() && <p className="alert"><Link href="/setup">Connect Supabase to enable staff login.</Link></p>}
    {params.notice === 'password-updated' && <p className="alert success" role="status">Password saved. Sign in with your new password.</p>}
    {params.error === 'link' && <p className="alert danger" role="alert">This link is invalid or expired. Request a new link.</p>}
    <AuthForm mode="login" />
  </AuthCard>;
}
