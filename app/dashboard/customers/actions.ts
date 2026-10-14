'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff } from '../../../lib/auth/session';
import { customerSchema, formStrings, versionInput, safeDatabaseError } from '../../../lib/business/validation';
import type { ActionState } from '../../../lib/validation';
export async function saveCustomer(_state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireStaff('customers.write');
  const parsed = customerSchema.safeParse({ ...formStrings(form,['full_name','email','phone','address']), archived:form.get('archived')==='on' });
  const id = String(form.get('id') ?? ''); const version=versionInput(form);
  if (!parsed.success || (id && !z.uuid().safeParse(id).success) || version<0) return { error:parsed.success ? 'Invalid record identifier.' : parsed.error.issues[0].message };
  const { data, error } = await db.rpc('save_customer', { payload:{ ...parsed.data, id }, expected_version:version });
  if (error) return { error:safeDatabaseError(error) };
  revalidatePath('/dashboard/customers'); revalidatePath('/dashboard');
  redirect(`/dashboard/customers/${data}?saved=1`);
}
