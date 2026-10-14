begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vehicle-photos','vehicle-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy hydra_photo_download on storage.objects for select to authenticated using
  (bucket_id='vehicle-photos' and public.has_permission('stock.read') and exists(select 1 from public.vehicle_photos p where p.path=name));
create policy hydra_photo_upload on storage.objects for insert to authenticated with check
  (bucket_id='vehicle-photos' and public.has_permission('stock.write') and exists(select 1 from public.vehicle_photos p where p.path=name and not p.ready));
create policy hydra_photo_cleanup on storage.objects for delete to authenticated using
  (bucket_id='vehicle-photos' and public.has_permission('stock.write') and exists(select 1 from public.vehicle_photos p where p.path=name and not p.ready));
drop policy audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated using
  (public.has_permission('audit.read') and (entity<>'vehicle_costs' or public.has_permission('costs.read')));
commit;
