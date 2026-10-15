import 'server-only';
import {publicSupabaseConfig} from './env';
export function testResetEnabled() {
  const config=publicSupabaseConfig();const expected=process.env.TEST_DATA_RESET_PROJECT_REF;
  return process.env.ENABLE_TEST_DATA_RESET==='true' && !!config && !!expected && new URL(config.url).hostname===expected+'.supabase.co';
}
