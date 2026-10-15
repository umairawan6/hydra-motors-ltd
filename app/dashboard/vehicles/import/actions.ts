'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireStaff} from '../../../../lib/auth/session';
import {can} from '../../../../lib/auth/permissions';
import {importRowsSchema,MAX_IMPORT_BYTES} from '../../../../lib/autotrader-import';
export type ImportState={error?:string;success?:string};
export async function importStock(_state:ImportState,form:FormData):Promise<ImportState> {
  const {db,permissions}=await requireStaff('stock.write');
  if(!can(permissions,'stock.read')) return {error:'Stock read permission is also required.'};
  if(form.get('confirm')!=='on') return {error:'Confirm that this is authorized Hydra Motors stock data.'};
  const raw=form.get('rows');if(typeof raw!=='string' || new TextEncoder().encode(raw).length>MAX_IMPORT_BYTES) return {error:'Import data is missing or too large.'};
  let payload;try{payload=importRowsSchema.safeParse(JSON.parse(raw));}catch{return {error:'Invalid import data. Preview the CSV again.'};}
  if(!payload.success) return {error:'Invalid vehicle rows. Preview a valid CSV again.'};
  const {data,error}=await db.rpc('import_autotrader_drafts',{items:payload.data});
  if(error) return {error:'Import could not be confirmed. Check Draft stock before retrying; matching rows are skipped. The batch is saved as one transaction. Check the file, migration and permissions.'};
  const result=z.object({imported:z.number().int().nonnegative(),skipped:z.number().int().nonnegative()}).safeParse(data);
  if(!result.success) return {error:'Unable to confirm import result. Refresh stock before retrying; matched vehicles are not imported twice.'};
  revalidatePath('/dashboard/vehicles');revalidatePath('/dashboard');
  return {success:`${result.data.imported} vehicle(s) imported as Draft. ${result.data.skipped} matching row(s) skipped. Existing vehicles were not changed.`};
}
