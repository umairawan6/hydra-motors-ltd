'use client';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import type { ActionState } from '../lib/validation';
import { login, requestPasswordReset, updatePassword } from '../app/login/actions';
import { SubmitButton } from './submit-button';
export function AuthForm({ mode }: { mode: 'login' | 'reset' | 'password' }) {
  const action = mode === 'login' ? login : mode === 'reset' ? requestPasswordReset : updatePassword;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [email, setEmail] = useState('');
  return <form action={formAction} className="form-stack">
    {state.error && <p className="alert danger" role="alert">{state.error}</p>}{state.success && <p className="alert success" role="status">{state.success}</p>}
    {mode !== 'password' && <label>Email address<input name="email" type="email" required autoComplete="username" maxLength={254} placeholder="you@hydramotors.co.uk" value={email} onChange={event => setEmail(event.target.value)} /></label>}
    {mode !== 'reset' && <label>{mode === 'password' ? 'New password' : 'Password'}<input name="password" type="password" required autoComplete={mode === 'password' ? 'new-password' : 'current-password'} minLength={mode === 'password' ? 12 : 1} maxLength={128} /></label>}
    {mode === 'password' && <><p className="muted small">Use at least 12 characters.</p><label>Confirm password<input name="confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label></>}
    <SubmitButton pending={mode === 'login' ? 'Signing in…' : 'Please wait…'}>{mode === 'login' ? 'Sign in' : mode === 'reset' ? 'Send reset link' : 'Save password'}</SubmitButton>
    <Link className="text-link" href={mode === 'login' ? '/forgot-password' : '/login'}>{mode === 'login' ? 'Forgot your password?' : 'Back to sign in'}</Link>
  </form>;
}
