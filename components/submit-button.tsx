'use client';
import { useFormStatus } from 'react-dom';
export function SubmitButton({ children, pending = 'Saving…', className = 'button primary', disabled=false }: { children: React.ReactNode; pending?: string; className?: string; disabled?:boolean }) {
  const { pending: busy } = useFormStatus();
  return <button type="submit" className={className} disabled={busy || disabled}>{busy ? pending : children}</button>;
}
