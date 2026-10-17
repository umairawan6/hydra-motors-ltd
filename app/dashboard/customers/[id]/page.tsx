import { notFound } from 'next/navigation';
import { z } from 'zod';
import Link from 'next/link';
import { requireStaff } from '../../../../lib/auth/session';
import { can } from '../../../../lib/auth/permissions';
import { BusinessForm, type FormField } from '../../../../components/business-form';
import {LicenceUploadForm} from '../../../../components/licence-upload-form';
import {removeLicence} from '../licence-actions';
import { saveCustomer } from '../actions';
export default async function CustomerDetail({ params,searchParams }: { params:Promise<{id:string}>;searchParams:Promise<{saved?:string}> }) {
  const { db,permissions }=await requireStaff('customers.read'); const { id }=await params; const isNew=id==='new'; if(isNew && !can(permissions,'customers.write')) notFound(); if(!isNew && !z.uuid().safeParse(id).success) notFound();
  const result=isNew ? null : await db.from('customers').select('*').eq('id',id).maybeSingle(); if(result?.error) throw new Error('Unable to load customer.'); if(!isNew && !result?.data) notFound(); const customer=result?.data;
  const fields:FormField[]=[{name:'id',type:'hidden',label:'ID',value:customer?.id ?? ''},{name:'version',type:'hidden',label:'Version',value:String(customer?.version ?? 0)},{name:'full_name',label:'Full name',required:true,value:customer?.full_name,maxLength:120},{name:'email',label:'Email',type:'email',value:customer?.email ?? '',maxLength:254},{name:'phone',label:'Phone',value:customer?.phone ?? '',maxLength:40},{name:'address',label:'Address',type:'textarea',value:customer?.address ?? ''},...(!isNew ? [{name:'archived',label:'Archive customer (history is retained)',type:'checkbox' as const,value:String(customer?.archived)}] : [])];
  return <><div className="page-heading"><div><h1>{isNew ? 'Add customer' : customer?.full_name}</h1><Link className="text-link" href="/dashboard/customers">Back to customers</Link></div></div>{(await searchParams).saved && <p className="alert success">Customer saved.</p>}<section className="card">{can(permissions,'customers.write') ? <BusinessForm key={`${id}:${customer?.version}`} action={saveCustomer} fields={fields} /> : <dl><dt>Email</dt><dd>{customer?.email ?? '—'}</dd><dt>Phone</dt><dd>{customer?.phone ?? '—'}</dd><dt>Address</dt><dd className="multiline">{customer?.address ?? '—'}</dd></dl>}</section>{customer && can(permissions,'customers.licence_read') && <CustomerLicences id={id} archived={customer.archived} />}{isNew && can(permissions,'customers.licence_manage') && <p className="muted">Save the customer first to upload front and back driving licence images.</p>}{customer && <section className="card"><h2>Sales history</h2><CustomerSales id={id} /></section>}</>;
}
async function CustomerSales({id}:{id:string}) { const {db}=await requireStaff('customers.read'); const {data,error}=await db.from('sales').select('id,invoice_number,status').eq('customer_id',id).order('created_at',{ascending:false}).limit(20); if(error) return <p className="alert danger">Unable to load history.</p>; return data?.length ? <ul>{data.map(sale => <li key={sale.id}><Link className="text-link" href={`/dashboard/sales/${sale.id}`}>{sale.invoice_number ?? 'Draft sale'}</Link> · {sale.status}</li>)}</ul> : <p className="muted">No accessible sales records.</p>; }

async function CustomerLicences({id,archived}:{id:string;archived:boolean}) {
  const {db,permissions}=await requireStaff('customers.licence_read');
  const {data,error}=await db.from('customer_licence_images').select('id,side,ready,created_at').eq('customer_id',id);
  if(error) return <section className="card"><h2>Driving licence</h2><p className="alert danger">Unable to load licence images.</p></section>;
  return <section className="card"><h2>Driving licence</h2><p className="muted small">Private front and back images. JPG, PNG or WebP, up to 3 MB per side. Camera capture depends on your phone/browser. Images are not included in invoices.</p><div className="two-column">{(['front','back'] as const).map(side=>{
    const image=data?.find(item=>item.side===side);return <section key={side}><h3>{side==='front' ? 'Front' : 'Back'}</h3>{image ? <>{image.ready ? <p><Link className="text-link" href={`/dashboard/assets/licences/${image.id}`} target="_blank" rel="noreferrer">View {side} image</Link></p> : <p className="alert danger">Incomplete upload. Remove this entry before retrying.</p>}{can(permissions,'customers.licence_manage') && <BusinessForm action={removeLicence} fields={[{name:'image_id',type:'hidden',label:'Image',value:image.id},{name:'confirm',type:'checkbox',label:`Permanently remove ${side} licence image (required before replacement)`}]} submit="Remove image" />}</> : can(permissions,'customers.licence_manage') && !archived ? <LicenceUploadForm id={id} side={side} /> : <p className="muted">No image recorded.</p>}</section>;
  })}</div></section>;
}
