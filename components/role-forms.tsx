'use client';
import { useActionState, useState } from 'react';
import { createRole, updateRolePermissions } from '../app/dashboard/roles/actions';
import { permissionLabels, type Permission } from '../lib/auth/permissions';
import { SubmitButton } from './submit-button';
export function CreateRoleForm() {
  const [state, action] = useActionState(createRole, {});
  const [key, setKey] = useState(''); const [name, setName] = useState('');
  return <form action={action} className="staff-edit"><label>Role key<input name="key" value={key} onChange={event => setKey(event.target.value)} required minLength={2} maxLength={32} pattern="[a-z][a-z0-9_]{1,31}" placeholder="stock_assistant" /></label><label>Display name<input name="name" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={60} placeholder="Stock assistant" /></label><SubmitButton>Create role</SubmitButton>{state.error && <p className="alert danger" role="alert">{state.error}</p>}{state.success && <p className="alert success" role="status">{state.success}</p>}</form>;
}
export function RolePermissionsForm({ role, selected, enabled }: { role: string; selected: string[]; enabled: Permission[] }) {
  const [state, action] = useActionState(updateRolePermissions, {});
  const [checked, setChecked] = useState(selected);
  const required = role === 'admin' ? ['users.manage', 'roles.manage', 'audit.read'] : [];
  return <form action={action}><input type="hidden" name="role" value={role} /><fieldset><legend className="muted small">Granted permissions</legend><div className="permission-grid">{enabled.map(permission => <label className="check-label" key={permission}><input type="checkbox" name="permissions" value={permission} checked={checked.includes(permission)} onChange={event => setChecked(values => event.target.checked ? [...values, permission] : values.filter(value => value !== permission))} disabled={required.includes(permission)} />{permissionLabels[permission]}{required.includes(permission) && <input type="hidden" name="permissions" value={permission} />}</label>)}</div></fieldset><SubmitButton>Save permissions</SubmitButton>{state.error && <p className="alert danger" role="alert">{state.error}</p>}{state.success && <p className="alert success" role="status">{state.success}</p>}</form>;
}
