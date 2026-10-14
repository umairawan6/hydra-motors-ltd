import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const project = process.env.SUPABASE_PROJECT_ID;
if (!project || !/^[a-z0-9]+$/.test(project)) throw new Error('Set SUPABASE_PROJECT_ID to your project reference first.');
// Requires Supabase CLI on PATH and a prior `supabase login`.
const result = spawnSync('supabase', ['gen', 'types', 'typescript', '--project-id', project, '--schema', 'public'], { encoding: 'utf8', shell: false });
if (result.error) throw result.error;
if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status ?? 1); }
if (!result.stdout.includes('export type Database')) throw new Error('CLI did not return database types. Existing file preserved.');
writeFileSync('lib/supabase/database.types.ts', result.stdout);
