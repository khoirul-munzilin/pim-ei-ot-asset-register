-- Jalankan seluruh script ini di Supabase SQL Editor
create extension if not exists pgcrypto;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  tagname text not null,
  functional_location text,
  equipment_number text,
  object_type text,
  plant_area text,
  brand text,
  model text,
  serial_number text,
  condition text default 'Belum Diverifikasi',
  criticality text,
  remarks text,
  source_sheet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists assets_equipment_unique on public.assets(equipment_number) where equipment_number is not null and equipment_number <> '';
create index if not exists assets_tag_idx on public.assets(tagname);
create index if not exists assets_category_idx on public.assets(category);

create table if not exists public.asset_photos (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  photo_type text not null default 'asset',
  file_path text not null,
  file_name text,
  created_at timestamptz not null default now()
);
create index if not exists asset_photos_asset_idx on public.asset_photos(asset_id);

alter table public.assets enable row level security;
alter table public.asset_photos enable row level security;

-- TANPA LOGIN: anon dapat membaca/menambah/mengubah data. Cocok untuk penggunaan internal awal.
-- Untuk publik permanen, aktifkan login dan ganti policy ini.
drop policy if exists "anon assets select" on public.assets;
drop policy if exists "anon assets insert" on public.assets;
drop policy if exists "anon assets update" on public.assets;
drop policy if exists "anon photos select" on public.asset_photos;
drop policy if exists "anon photos insert" on public.asset_photos;
drop policy if exists "anon photos delete" on public.asset_photos;
create policy "anon assets select" on public.assets for select to anon using (true);
create policy "anon assets insert" on public.assets for insert to anon with check (true);
create policy "anon assets update" on public.assets for update to anon using (true) with check (true);
create policy "anon photos select" on public.asset_photos for select to anon using (true);
create policy "anon photos insert" on public.asset_photos for insert to anon with check (true);
create policy "anon photos delete" on public.asset_photos for delete to anon using (true);
grant select, insert, update on public.assets to anon;
grant select, insert, delete on public.asset_photos to anon;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('asset-photos','asset-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true;

drop policy if exists "anon upload asset photos" on storage.objects;
drop policy if exists "public read asset photos" on storage.objects;
drop policy if exists "anon delete asset photos" on storage.objects;
create policy "anon upload asset photos" on storage.objects for insert to anon with check (bucket_id='asset-photos');
create policy "public read asset photos" on storage.objects for select to public using (bucket_id='asset-photos');
create policy "anon delete asset photos" on storage.objects for delete to anon using (bucket_id='asset-photos');
