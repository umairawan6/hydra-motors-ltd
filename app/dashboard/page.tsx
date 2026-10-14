import Link from 'next/link';
import { requireStaff } from '../../lib/auth/session';
import { can } from '../../lib/auth/permissions';
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { db, profile, permissions } = await requireStaff();
  const params = await searchParams;
  const [vehicles, customers, sales] = await Promise.all([
    can(permissions, 'stock.read') ? db.from('vehicles').select('id', { count: 'exact', head: true }) : null,
    can(permissions, 'customers.read') ? db.from('customers').select('id', { count: 'exact', head: true }) : null,
    db.from('sales').select('id,invoice_number,sale_price,status,created_at').order('created_at', { ascending: false }).limit(10),
  ]);
  return <><div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Welcome, {profile.full_name || 'team member'}</h1><p className="muted">Your dealership overview and staff access controls.</p></div><span className="badge success">Active account</span></div>
    {params.notice === 'forbidden' && <p className="alert danger" role="alert">Your role does not have access to that action.</p>}
    <div className="stat-grid">{vehicles && <section className="card"><p className="stat-label">Vehicle records</p><p className="stat-value">{vehicles.error ? 'Unavailable' : vehicles.count ?? 0}</p><p className="small muted">Manage availability and vehicle details.</p></section>}{customers && <section className="card"><p className="stat-label">Customer records</p><p className="stat-value">{customers.error ? 'Unavailable' : customers.count ?? 0}</p><p className="small muted">Stored securely in your database.</p></section>}<section className="card"><p className="stat-label">Your access</p><p className="stat-value">{permissions.length}</p><p className="small muted">Permissions for your staff role.</p></section></div>
    <section className="card"><div className="card-header"><h2>Recent sales</h2><span className="muted small">{can(permissions, 'sales.read_all') ? 'All staff' : 'Your sales'}</span></div>{sales.error ? <p className="alert danger">Sales could not be loaded. Please refresh or contact your administrator.</p> : !sales.data?.length ? <div className="empty-state"><h3>No sales yet</h3><p>Create a customer sale to issue your first invoice.</p></div> : <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th className="money">Sale price</th></tr></thead><tbody>{sales.data.map(sale => <tr key={sale.id}><td>{sale.invoice_number || 'Draft'}</td><td>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London' }).format(new Date(sale.created_at))}</td><td><span className="badge">{sale.status}</span></td><td className="money">{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(sale.sale_price))}</td></tr>)}</tbody></table></div>}</section>
    {can(permissions, 'users.manage') && <section className="card"><h2>Staff access</h2><p className="muted">Activate accounts, assign roles and review staff permissions.</p><Link href="/dashboard/users" className="button primary">Manage staff accounts</Link></section>}</>;
}
