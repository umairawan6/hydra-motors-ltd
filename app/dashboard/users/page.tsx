import Link from 'next/link';
import { requireStaff } from '../../../lib/auth/session';
import { InviteStaffForm, StaffAccessForm } from '../../../components/staff-forms';
import { PAGE_SIZE, pageNumber } from '../../../lib/pagination';
export default async function StaffAccounts({ searchParams }: { searchParams: Promise<{ page?: string; search?: string }> }) {
  const { db, user } = await requireStaff('users.manage');
  const params = await searchParams; const page = pageNumber(params.page); const search = (params.search ?? '').slice(0, 100).replace(/[%_\\]/g, '').trim();
  let query = db.from('profiles').select('id,email,full_name,role,active', { count: 'exact' }).order('created_at', { ascending: false }).order('id').range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (search) query = query.ilike('email', `%${search}%`);
  const [staff, roles] = await Promise.all([query, db.from('roles').select('key,name').order('name')]);
  if (staff.error || roles.error) throw new Error('Unable to load staff accounts.');
  const link = (number: number) => `/dashboard/users?page=${number}&search=${encodeURIComponent(search)}`;
  return <><div className="page-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h1>Staff accounts</h1><p className="muted">Invite staff and control who can access your workspace.</p></div></div><div className="two-column"><section className="card"><h2>Invite a team member</h2><p className="muted small">Invitations create inactive accounts. Activation and role assignment happen separately.</p><InviteStaffForm /></section><section className="card"><h2>Access rules</h2><p className="muted">Accounts require activation before accessing dealership data. Changes apply on the next request.</p><p className="muted small">You cannot modify your own access. Delegated staff managers cannot grant permissions beyond their own role or change administrator accounts.</p></section></div>
    <section className="card"><h2>Team directory</h2><form method="get" className="staff-edit"><label>Search by email<input name="search" defaultValue={search} maxLength={100} /></label><button className="button secondary">Search</button></form>{!staff.data?.length && <div className="empty-state">No matching staff accounts.</div>}{staff.data?.map(member => <div className="staff-row" key={member.id}><p><strong>{member.email || 'Email unavailable'}</strong> <span className={`badge ${member.active ? 'success' : ''}`}>{member.active ? 'Active' : 'Inactive'}</span></p><StaffAccessForm staff={member} roles={roles.data ?? []} self={member.id === user.id} /></div>)}<div className="pagination">{page > 1 ? <Link className="text-link" href={link(page - 1)}>Previous</Link> : <span />}<span className="muted small">Page {page} · {staff.count ?? 0} accounts</span>{page * PAGE_SIZE < (staff.count ?? 0) ? <Link className="text-link" href={link(page + 1)}>Next</Link> : <span />}</div></section></>;
}
