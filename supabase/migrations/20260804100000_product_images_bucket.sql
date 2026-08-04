-- Storage bucket for product images (max 2 MB, public read)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  2097152,  -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Owners can upload/delete images for their own business
create policy "Owner can upload product images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and private.owns_business((string_to_array(name, '/'))[1]::uuid)
);

create policy "Owner can delete product images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and private.owns_business((string_to_array(name, '/'))[1]::uuid)
);

-- Public read
create policy "Anyone can view product images"
on storage.objects for select
using (bucket_id = 'product-images');
