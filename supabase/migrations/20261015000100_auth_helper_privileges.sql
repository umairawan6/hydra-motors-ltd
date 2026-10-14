-- Supabase default privileges can grant anon EXECUTE independently of PUBLIC.
-- This profile helper is needed only by authenticated RLS policies.
revoke all on function public.is_active() from public, anon;
grant execute on function public.is_active() to authenticated;
