import { requireStaff } from '../../lib/auth/session';
import { can } from '../../lib/auth/permissions';
import { Navigation } from '../../components/navigation';
import { logout } from '../login/actions';
export const dynamic = 'force-dynamic';
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, permissions } = await requireStaff();
  const links = [{ href: '/dashboard', label: 'Overview' }];
  if (can(permissions, 'customers.read')) links.push({href:'/dashboard/customers',label:'Customers'});
  if (can(permissions, 'stock.read')) links.push({href:'/dashboard/vehicles',label:'Vehicle stock'});
  if (can(permissions,'sales.read_all') || can(permissions,'sales.write')) links.push({href:'/dashboard/sales',label:'Sales & invoices'});
  if (profile.role==='admin') links.push({href:'/dashboard/settings',label:'Invoice settings'});
  if (can(permissions,'finance.manage')) {links.push({href:'/dashboard/finance',label:'Finance invoices'});links.push({href:'/dashboard/expenses',label:'Supplier invoices'});}
  if (can(permissions, 'users.manage')) links.push({ href: '/dashboard/users', label: 'Staff accounts' });
  if (can(permissions, 'roles.manage')) links.push({ href: '/dashboard/roles', label: 'Roles & permissions' });
  if (can(permissions, 'audit.read')) links.push({ href: '/dashboard/audit', label: 'Activity log' });
  return <div className="workspace"><a href="#main-content" className="skip-link">Skip to content</a><aside className="sidebar"><div className="brand"><span className="brand-mark">H</span><span>HYDRA<small>MOTORS LTD</small></span></div><Navigation links={links} /><p className="sidebar-footer">Dealership workspace<br />Driven by Trust.</p></aside><div className="workspace-main"><header className="workspace-header"><span className="muted small">HYDRA MOTORS / STAFF PORTAL</span><div className="header-user"><div><p>{profile.full_name || profile.email}</p><span className="badge">{profile.role.replaceAll('_', ' ')}</span></div><form action={logout}><button className="button secondary">Sign out</button></form></div></header><main id="main-content" className="content">{children}</main></div></div>;
}
