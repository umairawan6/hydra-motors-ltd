'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {requireStaff} from '../../../../lib/auth/session';
import {supabaseAdmin} from '../../../../lib/supabase/admin';
import {testResetEnabled} from '../../../../lib/test-reset';
import type {ActionState} from '../../../../lib/validation';
const jobSchema=z.object({id:z.uuid(),completed_at:z.string().nullable(),assets:z.array(z.object({bucket:z.enum(['invoice-pdfs','vehicle-photos','supplier-documents']),path:z.string().min(1).max(2048)}))});
export async function resetTestData(_state:ActionState,form:FormData):Promise<ActionState> {
  const {profile,user}=await requireStaff();
  if(profile.role!=='admin') return {error:'Administrator access required.'};
  if(!testResetEnabled()) return {error:'Test reset is disabled for this environment or project.'};
  const request=z.uuid().safeParse(form.get('request_key'));
  if(!request.success || form.get('confirmation')!=='RESET TEST DATA' || form.get('confirm')!=='on') return {error:'Type RESET TEST DATA exactly and confirm permanent removal.'};
  try {
    const admin=supabaseAdmin();
    const {data,error}=await admin.rpc('begin_test_data_reset',{actor:user.id,request:request.data,confirmation:'RESET TEST DATA'});
    if(error) return {error:'Reset could not start. Check that the reset migration and database test-mode switch are configured. No successful reset is claimed.'};
    const job=jobSchema.parse(data);
    if(!job.completed_at) {
      for(const bucket of ['invoice-pdfs','vehicle-photos','supplier-documents'] as const) {
        const paths=job.assets.filter(asset=>asset.bucket===bucket).map(asset=>asset.path);
        for(let index=0;index<paths.length;index+=100) {
          const result=await admin.storage.from(bucket).remove(paths.slice(index,index+100));
          if(result.error) return {error:'Database records were cleared, but uploaded-file cleanup is pending. Submit again to retry the same cleanup; new records will not be reset by that retry.'};
        }
      }
      const completed=await admin.rpc('complete_test_data_reset',{actor:user.id,target:job.id});
      if(completed.error) return {error:'Database records were cleared, but cleanup could not be confirmed. Submit again to resume cleanup.'};
    }
  } catch {
    return {error:'Reset was interrupted. Refresh this page to check for pending cleanup, then retry. Staff accounts and company settings are preserved.'};
  }
  revalidatePath('/dashboard','layout');
  redirect('/dashboard/settings/test-data?reset=1');
}
