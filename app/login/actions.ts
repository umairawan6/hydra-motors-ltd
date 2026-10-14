"use server";
import {supabaseServer} from '../../lib/supabase';
import {redirect} from 'next/navigation';
export async function login(formData:FormData){
 const email=String(formData.get('email')||'');const password=String(formData.get('password')||'');
 const supabase=await supabaseServer();const {error}=await supabase.auth.signInWithPassword({email,password});
 if(error)redirect('/login?error=invalid');redirect('/dashboard');
}
export async function logout(){const supabase=await supabaseServer();await supabase.auth.signOut();redirect('/login')}
