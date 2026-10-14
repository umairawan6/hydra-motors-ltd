'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '../../../lib/auth/session';
import { vehicleSchema,costSchema,formStrings,versionInput,safeDatabaseError } from '../../../lib/business/validation';
import type { ActionState } from '../../../lib/validation';
export async function saveVehicle(_state:ActionState,form:FormData):Promise<ActionState> {
  const {db}=await requireStaff('stock.write'); const parsed=vehicleSchema.safeParse(formStrings(form,['registration','vin','make','model','model_year','mileage','purchase_date','status'])); const id=String(form.get('id') ?? ''); const version=versionInput(form);
  if(!parsed.success || (id && !z.uuid().safeParse(id).success) || version<0) return {error:parsed.success ? 'Invalid record identifier.' : parsed.error.issues[0].message};
  const {data,error}=await db.rpc('save_vehicle',{payload:{...parsed.data,id},expected_version:version}); if(error) return {error:safeDatabaseError(error)};
  revalidatePath('/dashboard/vehicles'); revalidatePath('/dashboard'); redirect(`/dashboard/vehicles/${data}?saved=1`);
}
export async function saveCosts(_state:ActionState,form:FormData):Promise<ActionState> {
  const {db}=await requireStaff('costs.write'); const parsed=costSchema.safeParse(formStrings(form,['purchase','preparation','other'])); const id=z.uuid().safeParse(form.get('id')); const version=versionInput(form);
  if(!parsed.success || !id.success || version<0) return {error:'Enter valid costs and a valid vehicle.'};
  const {error}=await db.rpc('save_vehicle_costs',{target_vehicle:id.data,purchase:Number(parsed.data.purchase),preparation:Number(parsed.data.preparation),other:Number(parsed.data.other),expected_version:version}); if(error) return {error:safeDatabaseError(error)};
  revalidatePath(`/dashboard/vehicles/${id.data}`); return {success:'Costs saved. Refresh before making another change.'};
}
