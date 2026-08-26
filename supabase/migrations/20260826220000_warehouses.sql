-- Gudang jadi entitas sendiri (mirip pola `outlets`), bukan cuma label di
-- ingredients — tiap gudang punya halaman/daftar stok sendiri DAN
-- penanggung jawab (PIC) sendiri, sesuai permintaan owner.
--
-- kind membedakan Gudang Kering/Basah (tempat bahan baku, banyak baris,
-- bisa ditambah) dari Gudang Setengah Jadi (satu baris tunggal per
-- business — cuma wadah untuk PIC, stoknya sendiri tetap di
-- semi_finished_items.stock yang sudah ada, tidak dipindah ke sini).
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  kind text not null default 'bahan_baku' check (kind in ('bahan_baku', 'setengah_jadi')),
  pic_employee_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create index warehouses_business_id_idx on public.warehouses (business_id);

alter table public.warehouses enable row level security;

create policy "Owner manages warehouses of own businesses"
on public.warehouses for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Seed Gudang Kering/Basah/Setengah Jadi untuk business cost-control yang
-- sudah ada (Lauk Nusantara) supaya halamannya tidak kosong dari awal.
insert into public.warehouses (business_id, name, kind)
select id, 'Gudang Kering', 'bahan_baku' from public.businesses where cost_control_enabled = true
union all
select id, 'Gudang Basah', 'bahan_baku' from public.businesses where cost_control_enabled = true
union all
select id, 'Gudang Setengah Jadi', 'setengah_jadi' from public.businesses where cost_control_enabled = true
on conflict (business_id, name) do nothing;

-- Ganti label bebas `ingredients.warehouse` (migration sebelumnya) jadi
-- referensi relasional ke warehouses — supaya daftar gudang bisa dikelola
-- (ditambah, diganti nama, diberi PIC) alih-alih 2 pilihan hardcode.
alter table public.ingredients add column warehouse_id uuid references public.warehouses (id) on delete set null;

update public.ingredients i
set warehouse_id = w.id
from public.warehouses w
where w.business_id = i.business_id and w.name = i.warehouse;

alter table public.ingredients drop column warehouse;

-- PIC per outlet ("Stock Resto"/"Stock Bar" — outlet sudah jadi entitas
-- sendiri dengan halamannya sendiri, tinggal tambah kolom PIC).
alter table public.outlets add column pic_employee_id uuid references public.employees (id) on delete set null;
