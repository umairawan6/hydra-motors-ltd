import Link from 'next/link';
import { requireStaff } from '../../../lib/auth/session';
import { can } from '../../../lib/auth/permissions';
import { PAGE_SIZE,pageNumber } from '../../../lib/pagination';
import { searchInput } from '../../../lib/business/format';
import { ListControls,Pagination } from '../../../components/list-controls';
export default async function Vehicles({searchParams}:{searchParams:Promise<{page?:string;search?:string;status?:string}>}) {
  const {db,permissions}=await requireStaff('stock.read'); const params=await searchParams; const page=pageNumber(params.page); const search=searchInput(params.search).replaceAll(' ',''); const statuses=['available','reserved','sold','archived']; const status=statuses.includes(params.status ?? '') ? params.status! : '';
  let query=db.from('vehicles').select('id,registration,make,model,mileage,status',{count:'exact'}).order('created_at',{ascending:false}).order('id').range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1); if(search) query=query.ilike('registration',`%${search}%`); if(status) query=query.eq('status',status);
  const {data,error,count}=await query; if(error) throw new Error('Unable to load stock.');
  return <><div className="page-heading"><div><p className="eyebrow">DEALERSHIP INVENTORY</p><h1>Vehicle stock</h1><p className="muted">Search by registration and track stock availability.</p></div>{can(permissions,'stock.write') && <Link href="/dashboard/vehicles/new" className="button primary">Add vehicle</Link>}</div><section className="card"><ListControls search={search} statuses={statuses} status={status} />{!data?.length ? <div className="empty-state">No vehicles match these filters.</div> : <div className="table-scroll"><table><thead><tr><th>Registration</th><th>Vehicle</th><th>Mileage</th><th>Status</th></tr></thead><tbody>{data.map(vehicle => <tr key={vehicle.id}><td><Link className="text-link" href={`/dashboard/vehicles/${vehicle.id}`}>{vehicle.registration}</Link></td><td>{vehicle.make} {vehicle.model}</td><td>{vehicle.mileage?.toLocaleString('en-GB') ?? '—'}</td><td><span className="badge">{vehicle.status}</span></td></tr>)}</tbody></table></div>}<Pagination page={page} count={count ?? 0} path="/dashboard/vehicles" search={search} status={status} /></section></>;
}
