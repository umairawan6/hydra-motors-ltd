import {z} from 'zod';
import {requireStaff} from '../../../../../lib/auth/session';
import {can} from '../../../../../lib/auth/permissions';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {db,permissions}=await requireStaff('customers.licence_read');const {id}=await params;
  if(!can(permissions,'customers.read') || !z.uuid().safeParse(id).success) return new Response('Not found',{status:404});
  const {data,error}=await db.from('customer_licence_images').select('path,side').eq('id',id).eq('ready',true).maybeSingle();
  if(error || !data) return new Response('Not found',{status:404});
  const result=await db.storage.from('customer-licences').download(data.path);
  if(result.error || !result.data) return new Response('Image unavailable',{status:404});
  return new Response(new Uint8Array(await result.data.arrayBuffer()),{headers:{'Content-Type':result.data.type,'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="licence-${data.side}"`}});
}
