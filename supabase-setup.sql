-- Jalankan SEKALI di Supabase > SQL Editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'technician' check (role in ('technician','administrator')),
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id text primary key,
  category text not null default '', tagname text not null default '',
  functional_location text default '', equipment_no text default '', object_type text default '',
  plant_area text default '', area_group text not null default 'AREA BELUM DITENTUKAN',
  brand text default '', model text default '', remark text default '',
  condition text not null default 'Unknown', status text not null default 'Active',
  photo_url text default '', updated_at timestamptz not null default now()
);
create index if not exists assets_area_idx on public.assets(area_group);
create index if not exists assets_category_idx on public.assets(category);
create index if not exists assets_tag_idx on public.assets(tagname);

alter table public.profiles enable row level security;
alter table public.assets enable row level security;

drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select to authenticated using (id=auth.uid() or auth.jwt()->>'email'='smartworkreport@gmail.com');
drop policy if exists "admin manage profiles" on public.profiles;
create policy "admin manage profiles" on public.profiles for all to authenticated using (auth.jwt()->>'email'='smartworkreport@gmail.com') with check (auth.jwt()->>'email'='smartworkreport@gmail.com');

drop policy if exists "public read assets" on public.assets;
create policy "public read assets" on public.assets for select to anon, authenticated using (true);
drop policy if exists "authenticated update assets" on public.assets;
create policy "authenticated update assets" on public.assets for update to authenticated using (true) with check (true);
drop policy if exists "admin insert assets" on public.assets;
create policy "admin insert assets" on public.assets for insert to authenticated with check (auth.jwt()->>'email'='smartworkreport@gmail.com');
drop policy if exists "admin delete assets" on public.assets;
create policy "admin delete assets" on public.assets for delete to authenticated using (auth.jwt()->>'email'='smartworkreport@gmail.com');

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,full_name,role)
 values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),case when new.email='smartworkreport@gmail.com' then 'administrator' else 'technician' end)
 on conflict(id) do update set email=excluded.email;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

insert into public.profiles(id,email,full_name,role)
select id,email,coalesce(raw_user_meta_data->>'full_name',''),case when email='smartworkreport@gmail.com' then 'administrator' else 'technician' end
from auth.users on conflict(id) do update set email=excluded.email, role=excluded.role;

-- Pengamanan server: Technician hanya boleh mengubah dokumentasi/condition/status/foto.
create or replace function public.protect_asset_master_fields()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(auth.jwt()->>'email','') <> 'smartworkreport@gmail.com' then
    if new.id is distinct from old.id
       or new.category is distinct from old.category
       or new.tagname is distinct from old.tagname
       or new.functional_location is distinct from old.functional_location
       or new.equipment_no is distinct from old.equipment_no
       or new.object_type is distinct from old.object_type
       or new.plant_area is distinct from old.plant_area
       or new.area_group is distinct from old.area_group
       or new.brand is distinct from old.brand
       or new.model is distinct from old.model then
      raise exception 'Technician tidak diizinkan mengubah identitas/master aset';
    end if;
  end if;
  new.updated_at=now();
  return new;
end; $$;
drop trigger if exists protect_asset_master_fields on public.assets;
create trigger protect_asset_master_fields before update on public.assets
for each row execute procedure public.protect_asset_master_fields();
