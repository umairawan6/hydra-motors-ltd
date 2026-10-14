'use client';
import { useActionState, useState } from 'react';
import { inviteStaff, updateStaffAccess } from '../app/dashboard/users/actions';
import { SubmitButton } from './submit-button';
export function InviteStaffForm() {
  const [state, action] = useActionState(inviteStaff, {});
  const [email, setEmail] = useState('');
  return <form action={action} className="form-stack"><label>Staff email<input name="email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label><label className="check-label"><input type="checkbox" name="confirm" required />Send this person a staff invitation email</label><SubmitButton pending="Sending…">Send invitation</SubmitButton>{state.error && <p className="alert danger" role="alert">{state.error}</p>}{state.success && <p className="alert success" role="status">{state.success}</p>}</form>;
}
export function StaffAccessForm({ staff, roles, self }: { staff: { id: string; full_name: string; role: string; active: boolean }; roles: { key: string; name: string }[]; self: boolean }) {
  const [state, action] = useActionState(updateStaffAccess, {});
  const [fullName, setFullName] = useState(staff.full_name);
  const [role, setRole] = useState(staff.role);
  const [active, setActive] = useState(staff.active);
  if (self) return <p className="muted small">Your account · Ask another administrator to change your access.</p>;
  return <form action={action}><input type="hidden" name="id" value={staff.id} /><div className="staff-edit"><label>Full name<input name="fullName" value={fullName} onChange={event => setFullName(event.target.value)} required maxLength={120} /></label><label>Role<select name="role" value={role} onChange={event => setRole(event.target.value)}>{roles.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label><label className="check-label"><input type="checkbox" name="active" checked={active} onChange={event => setActive(event.target.checked)} />Active</label><SubmitButton>Save access</SubmitButton></div>{state.error && <p className="alert danger" role="alert">{state.error}</p>}{state.success && <p className="alert success" role="status">{state.success}</p>}</form>;
}
