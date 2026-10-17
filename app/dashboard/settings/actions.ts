'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireStaff} from '../../../lib/auth/session';
import {formStrings,safeDatabaseError} from '../../../lib/business/validation';
import type {ActionState} from '../../../lib/validation';
const schema=z.object({company_name:z.string().trim().min(1).max(120),address:z.string().trim().min(1).max(1000),registration_number:z.string().trim().min(1).max(40),email:z.string().trim().max(254).refine(value=>!value || z.email().safeParse(value).success),phone:z.string().trim().max(40),payment_details:z.string().trim().max(1000),terms:z.string().trim().min(1).max(5000),sale_terms:z.string().trim().min(1).max(10000),approved:z.literal(true)});
export async function saveBilling(_state:ActionState,form:FormData):Promise<ActionState> {const {db,profile}=await requireStaff(); if(profile.role!=='admin') return {error:'Administrator access required.'}; const parsed=schema.safeParse({...formStrings(form,['company_name','address','registration_number','email','phone','payment_details','terms','sale_terms']),approved:form.get('approved')==='on'}); if(!parsed.success) return {error:'Complete the company details and confirm the invoice settings.'}; const {error}=await db.rpc('save_billing_settings',{payload:parsed.data}); if(error) return {error:safeDatabaseError(error)}; revalidatePath('/dashboard/settings'); return {success:'Invoice settings saved. Future invoices use these values; existing invoices retain their snapshots.'};}
