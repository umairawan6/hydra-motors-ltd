import { requireStaff } from '../../../lib/auth/session';
import { isPermission } from '../../../lib/auth/permissions';
import { CreateRoleForm, RolePermissionsForm } from '../../../components/role-forms';
export default async function Roles() {
  const { db } = await requireStaff('roles.manage');
  const [roles, permissions, grants] = await Promise.all([db.from('roles').select('key,name,system_role').order('created_at'), db.from('permissions').select('key').order('key'), db.from('role_permissions').select('role_key,permission_key')]);
  if (roles.error || permissions.error || grants.error) throw new Error('Unable to load roles.');
  const enabled = (permissions.data ?? []).map(item => item.key).filter(isPermission);
  return <><div className="page-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h1>Roles & permissions</h1><p className="muted">Changes affect everyone assigned to a role on their next request.</p></div></div><section className="card"><h2>Create a role</h2><CreateRoleForm /></section><div className="two-column">{roles.data?.map(role => <section className="card" key={role.key}><div className="card-header"><h2>{role.name}</h2><span className="badge">{role.system_role ? 'Default role' : 'Custom role'}</span></div><RolePermissionsForm role={role.key} enabled={enabled} selected={(grants.data ?? []).filter(grant => grant.role_key === role.key).map(grant => grant.permission_key)} /></section>)}</div></>;
}
