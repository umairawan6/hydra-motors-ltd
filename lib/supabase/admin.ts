import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { publicSupabaseConfig } from '../env';
export function supabaseAdmin() {
  const config = publicSupabaseConfig();
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) throw new Error('Staff invitations need a server-only Supabase secret key.');
  return createClient(config.url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
