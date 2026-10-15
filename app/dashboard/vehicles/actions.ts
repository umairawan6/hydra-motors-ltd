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
export async function archiveVehicle(_state:ActionState,form:FormData):Promise<ActionState> {
  const {db}=await requireStaff('stock.write');const id=z.uuid().safeParse(form.get('id'));const version=versionInput(form);
  if(!id.success || version<1 || form.get('confirm')!=='on') return {error:'Confirm removal of this vehicle from stock.'};
  const {data:vehicle,error:readError}=await db.from('vehicles').select('*').eq('id',id.data).maybeSingle();
  if(readError || !vehicle) return {error:'Unable to load the vehicle.'};
  if(vehicle.status==='sold') return {error:'Sold vehicles must use the invoice credit and stock-return workflow.'};
  const {error}=await db.rpc('save_vehicle',{payload:{id:vehicle.id,registration:vehicle.registration,vin:vehicle.vin,make:vehicle.make,model:vehicle.model,model_year:vehicle.model_year,mileage:vehicle.mileage,purchase_date:vehicle.purchase_date,status:'archived'},expected_version:version});
  if(error) return {error:safeDatabaseError(error)};
  revalidatePath('/dashboard/vehicles');revalidatePath('/dashboard');revalidatePath(`/dashboard/vehicles/${id.data}`);redirect('/dashboard/vehicles?removed=1');
}
