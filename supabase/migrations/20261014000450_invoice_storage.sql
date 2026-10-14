begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('invoice-pdfs','invoice-pdfs',false,5242880,array['application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy hydra_invoice_download on storage.objects for select to authenticated using(bucket_id='invoice-pdfs' and exists(select 1 from public.invoices i where i.document_path=name));
-- PDFs are authored by the trusted server from immutable snapshots. No client insert/update/delete policy.
commit;
