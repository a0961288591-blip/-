-- =====================================================================
-- REBECCA ESTATE AI · Migration 04 · Storage 私有檔案
-- 路徑：{tenant_id}/{property_id}/{file_id}/{檔名}
-- 必須先建立 property_files 中繼資料，才能上傳；下載一律透過短效 signed URL
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('property-files', 'property-files', false, 52428800)
on conflict (id) do update set public = false;

create or replace function public.can_read_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.property_files f
    where f.storage_path = p_name
      and f.deleted_at is null
      and public.is_tenant_member(f.tenant_id)
      and (f.sensitivity <> 'restricted' or public.can_view_property_private(f.tenant_id, f.property_id))
  )
$$;

create or replace function public.can_write_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.property_files f
    where f.storage_path = p_name
      and f.deleted_at is null
      and public.can_edit_property(f.tenant_id, f.property_id)
      and (f.sensitivity <> 'restricted' or public.can_view_property_private(f.tenant_id, f.property_id))
  )
$$;

grant execute on function public.can_read_storage_object(text), public.can_write_storage_object(text) to authenticated;

create policy "property-files read" on storage.objects for select to authenticated
  using (bucket_id = 'property-files' and public.can_read_storage_object(name));

create policy "property-files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-files' and public.can_write_storage_object(name));

create policy "property-files delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'property-files'
    and exists (
      select 1 from public.property_files f
      where f.storage_path = storage.objects.name
        and public.has_tenant_role(f.tenant_id, 'manager')
    )
  );
