import {afterEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {testResetEnabled} from '../lib/test-reset';
afterEach(()=>vi.unstubAllEnvs());
it('requires an explicit server flag and matching project reference',()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://testing.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','public-test');
  vi.stubEnv('ENABLE_TEST_DATA_RESET','false');vi.stubEnv('TEST_DATA_RESET_PROJECT_REF','testing');expect(testResetEnabled()).toBe(false);
  vi.stubEnv('ENABLE_TEST_DATA_RESET','true');vi.stubEnv('TEST_DATA_RESET_PROJECT_REF','other');expect(testResetEnabled()).toBe(false);
  vi.stubEnv('TEST_DATA_RESET_PROJECT_REF','');expect(testResetEnabled()).toBe(false);
  vi.stubEnv('TEST_DATA_RESET_PROJECT_REF','testing');expect(testResetEnabled()).toBe(true);
});
