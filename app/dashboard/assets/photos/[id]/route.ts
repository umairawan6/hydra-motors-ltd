import {z} from 'zod';
import {requireStaff} from '../../../../../lib/auth/session';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {db}=await requireStaff('stock.read'); const {id}=await params; if(!z.uuid().safeParse(id).success) return new Response('Not found',{status:404});
  const {data,error}=await db.from('vehicle_photos').select('path').eq('id',id).eq('ready',true).maybeSingle(); if(error || !data) return new Response('Not found',{status:404});
  const result=await db.storage.from('vehicle-photos').download(data.path); if(result.error || !result.data) return new Response('File unavailable',{status:404});
  return new Response(new Uint8Array(await result.data.arrayBuffer()),{headers:{'Content-Type':result.data.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
