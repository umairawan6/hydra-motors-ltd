'use server';
import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireStaff} from '../../../lib/auth/session';
import {fileKind} from '../../../lib/business/files';
import type {ActionState} from '../../../lib/validation';
export async function uploadVehiclePhoto(_state:ActionState,form:FormData):Promise<ActionState> {
  const {db}=await requireStaff('stock.write'); const vehicle=z.uuid().safeParse(form.get('id')); const file=form.get('file');
  if(!vehicle.success || !(file instanceof File) || file.size===0 || file.size>5*1024*1024) return {error:'Choose a JPG, PNG or WebP file up to 5 MB.'};
  const bytes=new Uint8Array(await file.arrayBuffer()); const kind=fileKind(bytes); if(!kind) return {error:'Unsupported file content.'};
  const id=randomUUID(); const path=`${vehicle.data}/${id}.${kind.extension}`;
  const metadata=await db.from('vehicle_photos').insert({id,vehicle_id:vehicle.data,path}); if(metadata.error) return {error:'Unable to prepare upload. Check your vehicle and permissions.'};
  const uploaded=await db.storage.from('vehicle-photos').upload(path,bytes,{contentType:kind.mime,upsert:false});
  if(uploaded.error) { await db.from('vehicle_photos').delete().eq('id',id); return {error:'Upload failed. Apply the Storage migration and check your connection.'}; }
  const saved=await db.from('vehicle_photos').update({ready:true}).eq('id',id); if(saved.error) { await db.storage.from('vehicle-photos').remove([path]); await db.from('vehicle_photos').delete().eq('id',id); return {error:'Unable to finalize upload. Please try again.'}; }
  revalidatePath(`/dashboard/vehicles/${vehicle.data}`); return {success:'Photo uploaded.'};
}
