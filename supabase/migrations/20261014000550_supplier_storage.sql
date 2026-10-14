begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('supplier-documents','supplier-documents',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy hydra_supplier_download on storage.objects for select to authenticated using(bucket_id='supplier-documents' and exists(select 1 from public.supplier_documents d where d.path=name and public.can_access_supplier(d.invoice_id)));
create policy hydra_supplier_upload on storage.objects for insert to authenticated with check(bucket_id='supplier-documents' and exists(select 1 from public.supplier_documents d where d.path=name and not d.ready and public.can_access_supplier(d.invoice_id)));
create policy hydra_supplier_cleanup on storage.objects for delete to authenticated using(bucket_id='supplier-documents' and exists(select 1 from public.supplier_documents d where d.path=name and not d.ready and public.can_access_supplier(d.invoice_id)));
create function public.protect_ready_asset() returns trigger language plpgsql set search_path='' as $$ begin
  if old.ready then raise exception 'Finalized attachments are immutable'; end if;
  if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger protect_ready_photos before update or delete on public.vehicle_photos for each row execute function public.protect_ready_asset();
create trigger protect_ready_supplier_docs before update or delete on public.supplier_documents for each row execute function public.protect_ready_asset();
revoke all on function public.protect_ready_asset() from public,anon,authenticated;
commit;
