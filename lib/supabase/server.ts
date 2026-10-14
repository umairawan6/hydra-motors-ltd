import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { publicSupabaseConfig } from '../env';
import type { Database } from './database.types';
export async function supabaseServer() {
  const config = publicSupabaseConfig();
  if (!config) throw new Error('Supabase is not configured. Follow README.md.');
  const store = await cookies();
  return createServerClient<Database>(config.url, config.key, { cookies: {
    getAll: () => store.getAll(),
    setAll(items) {
      // Server Components cannot write cookies. proxy.ts refreshes their sessions.
      try { items.forEach(({ name, value, options }) => store.set(name, value, options)); }
      catch (error) { if (!(error instanceof Error) || !error.message.includes('Cookies can only be modified')) throw error; }
    },
  } });
}
