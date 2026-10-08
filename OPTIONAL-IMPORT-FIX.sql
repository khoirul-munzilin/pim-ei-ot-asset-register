-- Jalankan hanya jika import menampilkan error ON CONFLICT
create unique index if not exists assets_equipment_unique on public.assets(equipment_number) where equipment_number is not null and equipment_number <> '';
