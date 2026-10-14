-- Run ONCE in the Supabase SQL Editor after creating your first Auth user.
-- Replace the UUID and display name. This privileged setup is not an app API.
begin;
do $$ begin
  if exists(select 1 from public.profiles where role='admin' and active) then
    raise exception 'An active administrator already exists. Use the staff management screen.';
  end if;
  update public.profiles set role='admin',active=true,full_name='Owner',updated_at=now()
    where id='00000000-0000-0000-0000-000000000000';
  if not found then raise exception 'Replace the placeholder with your Auth user UUID'; end if;
end $$;
commit;
