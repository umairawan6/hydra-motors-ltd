import Link from 'next/link';
import { requireStaff } from '../../../lib/auth/session';
import { can } from '../../../lib/auth/permissions';
import { PAGE_SIZE, pageNumber } from '../../../lib/pagination';
import { searchInput } from '../../../lib/business/format';
import { ListControls, Pagination } from '../../../components/list-controls';
export default async function Customers({ searchParams }: { searchParams: Promise<{page?:string;search?:string;status?:string}> }) {
  const { db, permissions } = await requireStaff('customers.read'); const params=await searchParams; const page=pageNumber(params.page); const search=searchInput(params.search); const status=params.status==='archived' ? 'archived' : params.status==='active' ? 'active' : '';
  let query=db.from('customers').select('id,full_name,email,phone,archived',{count:'exact'}).order('created_at',{ascending:false}).order('id').range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1);
  if (search) query=query.ilike('full_name',`%${search}%`); if (status) query=query.eq('archived',status==='archived');
  const { data,error,count }=await query; if(error) throw new Error('Unable to load customers.');
  return <><div className="page-heading"><div><p className="eyebrow">CUSTOMER RECORDS</p><h1>Customers</h1><p className="muted">Contact details and invoice history.</p></div>{can(permissions,'customers.write') && <Link href="/dashboard/customers/new" className="button primary">Add customer</Link>}</div><section className="card"><ListControls search={search} status={status} statuses={['active','archived']} />{!data?.length ? <div className="empty-state">No customers match these filters.</div> : <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead><tbody>{data.map(customer => <tr key={customer.id}><td><Link className="text-link" href={`/dashboard/customers/${customer.id}`}>{customer.full_name}</Link></td><td>{customer.email ?? '—'}</td><td>{customer.phone ?? '—'}</td><td><span className="badge">{customer.archived ? 'Archived' : 'Active'}</span></td></tr>)}</tbody></table></div>}<Pagination page={page} count={count ?? 0} path="/dashboard/customers" search={search} status={status} /></section></>;
}
