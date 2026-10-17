'use server';
import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireStaff} from '../../../lib/auth/session';
import {can} from '../../../lib/auth/permissions';
import {fileKind} from '../../../lib/business/files';
import type {ActionState} from '../../../lib/validation';
export async function uploadLicence(_state:ActionState,form:FormData):Promise<ActionState> {
  const {db,permissions}=await requireStaff('customers.licence_manage');
  if(!can(permissions,'customers.read') || !can(permissions,'customers.licence_read')) return {error:'Customer and licence read permissions are required.'};
  const customer=z.uuid().safeParse(form.get('id')),side=z.enum(['front','back']).safeParse(form.get('side'));const file=form.get('file');
  if(!customer.success || !side.success || !(file instanceof File) || file.size===0 || file.size>3*1024*1024) return {error:'Choose a front/back JPG, PNG or WebP image up to 3 MB.'};
  const bytes=new Uint8Array(await file.arrayBuffer());const kind=fileKind(bytes);if(!kind) return {error:'Unsupported image content. Use JPG, PNG or WebP; HEIC and PDF are not supported.'};
  const id=randomUUID(),path=`${customer.data}/${id}.${kind.extension}`;
  const metadata=await db.from('customer_licence_images').insert({id,customer_id:customer.data,side:side.data,path});
  if(metadata.error) return {error:'Unable to prepare upload. Check access and remove any existing image for this side before replacing it.'};
  const uploaded=await db.storage.from('customer-licences').upload(path,bytes,{contentType:kind.mime,upsert:false});
  if(uploaded.error) {await db.from('customer_licence_images').delete().eq('id',id);revalidatePath(`/dashboard/customers/${customer.data}`);return {error:'Upload failed. Check your connection and retry; remove an incomplete upload first if shown.'};}
  const saved=await db.from('customer_licence_images').update({ready:true}).eq('id',id);
  if(saved.error) {
    const removed=await db.storage.from('customer-licences').remove([path]);
    if(!removed.error) await db.from('customer_licence_images').delete().eq('id',id);
    revalidatePath(`/dashboard/customers/${customer.data}`);return {error:'Upload could not be finalized. Remove the incomplete upload if shown, then retry.'};
  }
  revalidatePath(`/dashboard/customers/${customer.data}`);return {success:'Licence image uploaded.'};
}
export async function removeLicence(_state:ActionState,form:FormData):Promise<ActionState> {
  const {db,permissions}=await requireStaff('customers.licence_manage');
  if(!can(permissions,'customers.read') || !can(permissions,'customers.licence_read')) return {error:'Customer and licence read permissions are required.'};
  const id=z.uuid().safeParse(form.get('image_id'));if(!id.success || form.get('confirm')!=='on') return {error:'Confirm removal of this licence image.'};
  const {data,error}=await db.from('customer_licence_images').select('id,customer_id,path').eq('id',id.data).maybeSingle();
  if(error || !data) return {error:'Image unavailable. Refresh the customer record.'};
  const removed=await db.storage.from('customer-licences').remove([data.path]);if(removed.error) return {error:'Unable to remove image. Check your connection and retry.'};
  const deleted=await db.from('customer_licence_images').delete().eq('id',data.id);revalidatePath(`/dashboard/customers/${data.customer_id}`);
  if(deleted.error) return {error:'File removed, but metadata cleanup needs retrying. Refresh and remove the incomplete entry.'};
  return {success:'Licence image removed.'};
}
