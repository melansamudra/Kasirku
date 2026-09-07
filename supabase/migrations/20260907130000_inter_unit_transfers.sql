-- Gudang Central: transfer stok LINTAS BISNIS ke unit usaha lain (Llauk,
-- PASTRI, Dapur Produksi, dst -- semua owner_id sama). Beda dari
-- location_transfers (yang cuma antar-lokasi DALAM 1 business_id) -- ini
-- betulan memindahkan stok antar business_id + otomatis membuat
-- "hutang antar-unit" (arahan user 2026-09-07: Gudang Central jadi
-- perantara, ambil barang dari gudangnya = surat jalan terbit = jadi
-- tagihan ke unit yang minta).
--
-- Desain V1 SENGAJA satu langkah (kirim = terima sekaligus, atomik dalam 1
-- RPC) -- tidak ada status pending/confirm terpisah, meniru pola
-- fulfill_location_transfer_public (RPC security definer tunggal = 1
-- transaksi Postgres). Stok pakai ingredient_location_stock (BUKAN
-- ingredients.stock flat) karena semua bisnis yang terlibat sudah
-- cost_control_enabled/rich_stock_ops_enabled/stock_locations_enabled.

create table public.inter_unit_transfers (
  id uuid primary key default gen_random_uuid(),
  from_business_id uuid not null references public.businesses (id) on delete cascade,
  to_business_id uuid not null references public.businesses (id) on delete cascade,
  from_location_id uuid not null references public.stock_locations (id),
  to_location_id uuid not null references public.stock_locations (id),
  transfer_number text not null,
  note text,
  sent_by_user_id uuid,
  sent_by_name text not null,
  total_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index inter_unit_transfers_number_idx
  on public.inter_unit_transfers (from_business_id, transfer_number);
create index inter_unit_transfers_from_idx on public.inter_unit_transfers (from_business_id, created_at desc);
create index inter_unit_transfers_to_idx on public.inter_unit_transfers (to_business_id, created_at desc);

alter table public.inter_unit_transfers enable row level security;

create policy "Owner/staff of either business view/manage inter-unit transfers"
on public.inter_unit_transfers for all
using (private.owns_business(from_business_id) or private.owns_business(to_business_id))
with check (private.owns_business(from_business_id) or private.owns_business(to_business_id));

create table public.inter_unit_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.inter_unit_transfers (id) on delete cascade,
  from_ingredient_id uuid not null references public.ingredients (id),
  to_ingredient_id uuid not null references public.ingredients (id),
  item_name text not null,
  unit text not null,
  qty numeric(12, 2) not null check (qty > 0),
  unit_cost numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0
);

create index inter_unit_transfer_items_transfer_id_idx on public.inter_unit_transfer_items (transfer_id);

alter table public.inter_unit_transfer_items enable row level security;

create policy "Owner/staff of either business view/manage inter-unit transfer items"
on public.inter_unit_transfer_items for all
using (
  exists (
    select 1 from public.inter_unit_transfers t
    where t.id = transfer_id
      and (private.owns_business(t.from_business_id) or private.owns_business(t.to_business_id))
  )
)
with check (
  exists (
    select 1 from public.inter_unit_transfers t
    where t.id = transfer_id
      and (private.owns_business(t.from_business_id) or private.owns_business(t.to_business_id))
  )
);

-- Akun baru buat pasangan piutang/hutang antar-unit -- 1-110 & 2-110 belum
-- pernah dipakai di seed manapun (lihat riset: blok 1xx dipakai piutang,
-- 2xx dipakai hutang, pola penomoran puluhan seperti 1-060/1-100/2-100).
alter table public.journal_entries drop constraint if exists journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in (
    'manual', 'penjualan', 'void', 'pembelian', 'beban', 'payroll',
    'tutup_buku', 'koreksi', 'shift', 'kas_kecil', 'transfer_antar_unit'
  ));

create or replace function private.seed_default_accounts(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (business_id, code, name, type, normal_balance, is_system)
  values
    (p_business_id, '1-001', 'Kas & Bank', 'aset', 'debit', true),
    (p_business_id, '1-050', 'Kas Kecil Menunggu Klasifikasi', 'aset', 'debit', true),
    (p_business_id, '1-060', 'Piutang Karyawan', 'aset', 'debit', true),
    (p_business_id, '1-100', 'Piutang Usaha', 'aset', 'debit', true),
    (p_business_id, '1-110', 'Piutang Antar-Unit', 'aset', 'debit', true),
    (p_business_id, '1-200', 'Persediaan', 'aset', 'debit', true),
    (p_business_id, '1-500', 'Peralatan', 'aset', 'debit', true),
    (p_business_id, '1-501', 'Akumulasi Penyusutan', 'aset', 'kredit', true),
    (p_business_id, '2-001', 'Utang Dagang', 'kewajiban', 'kredit', true),
    (p_business_id, '2-100', 'Utang Gaji', 'kewajiban', 'kredit', true),
    (p_business_id, '2-110', 'Hutang Antar-Unit', 'kewajiban', 'kredit', true),
    (p_business_id, '2-200', 'PPN Keluaran (Utang Pajak)', 'kewajiban', 'kredit', true),
    (p_business_id, '3-001', 'Modal Pemilik', 'modal', 'kredit', true),
    (p_business_id, '3-100', 'Laba Ditahan', 'modal', 'kredit', true),
    (p_business_id, '4-001', 'Pendapatan Penjualan', 'pendapatan', 'kredit', true),
    (p_business_id, '4-002', 'Pendapatan Tiket', 'pendapatan', 'kredit', true),
    (p_business_id, '4-003', 'Pendapatan Gofood', 'pendapatan', 'kredit', true),
    (p_business_id, '4-004', 'Pendapatan Grabfood', 'pendapatan', 'kredit', true),
    (p_business_id, '4-999', 'Pendapatan Lain-lain', 'pendapatan', 'kredit', true),
    (p_business_id, '5-001', 'Beban Pokok Penjualan (HPP)', 'beban', 'debit', true),
    (p_business_id, '5-100', 'Beban Gaji', 'beban', 'debit', true),
    (p_business_id, '5-101', 'Beban Listrik & Air', 'beban', 'debit', true),
    (p_business_id, '5-102', 'Beban Sewa', 'beban', 'debit', true),
    (p_business_id, '5-103', 'Beban Marketing', 'beban', 'debit', true),
    (p_business_id, '5-104', 'Beban Perlengkapan', 'beban', 'debit', true),
    (p_business_id, '5-105', 'Beban Penyusutan', 'beban', 'debit', true),
    (p_business_id, '5-106', 'Beban Gas LPG', 'beban', 'debit', true),
    (p_business_id, '5-107', 'Beban Konsumsi', 'beban', 'debit', true),
    (p_business_id, '5-108', 'Beban Komisi Ojol', 'beban', 'debit', true),
    (p_business_id, '5-999', 'Beban Lain-lain', 'beban', 'debit', true)
  on conflict (business_id, code) do nothing;
end;
$$;

-- Backfill 1-110/2-110 ke bisnis yang SUDAH ADA (termasuk Gudang Central
-- yang baru dibuat sebelum migration ini, jadi belum kebagian dari trigger).
-- on conflict do nothing -- aman dijalankan ulang, tidak bentrok akun custom.
insert into public.accounts (business_id, code, name, type, normal_balance, is_system)
select b.id, '1-110', 'Piutang Antar-Unit', 'aset', 'debit', true
from public.businesses b
on conflict (business_id, code) do nothing;

insert into public.accounts (business_id, code, name, type, normal_balance, is_system)
select b.id, '2-110', 'Hutang Antar-Unit', 'kewajiban', 'kredit', true
from public.businesses b
on conflict (business_id, code) do nothing;

-- RPC utama: kirim stok dari 1 bisnis ke bisnis lain, atomik. Item dicocokkan
-- ANTAR business_id berdasarkan lower(trim(name)) -- kalau belum ada bahan
-- dengan nama sama di bisnis tujuan, otomatis dibuatkan barunya (mirip pola
-- di receive-delivery-note-actions.ts, tapi ini beneran mindahin stok+nilai,
-- bukan cuma paper-trail).
create or replace function public.ship_inter_unit_transfer(
  p_from_business_id uuid,
  p_to_business_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_items jsonb, -- array of {ingredient_id, qty}
  p_sent_by_name text,
  p_note text default null
)
returns table (transfer_id uuid, transfer_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_owner uuid;
  v_to_owner uuid;
  v_transfer_id uuid;
  v_transfer_number text;
  v_seq int;
  v_item jsonb;
  v_ingredient_id uuid;
  v_qty numeric(12, 2);
  v_ingredient record;
  v_from_stock_row record;
  v_from_stock_before numeric(12, 2);
  v_to_ingredient_id uuid;
  v_to_stock_before numeric(12, 2);
  v_line_amount numeric(12, 2);
  v_total numeric(12, 2) := 0;
begin
  if not private.owns_business(p_from_business_id) then
    raise exception 'not authorized for sender business';
  end if;

  select owner_id into v_from_owner from public.businesses where id = p_from_business_id;
  select owner_id into v_to_owner from public.businesses where id = p_to_business_id;
  if v_from_owner is null or v_to_owner is null or v_from_owner <> v_to_owner then
    raise exception 'sender and receiver businesses must share the same owner';
  end if;

  if not exists (
    select 1 from public.stock_locations
    where id = p_from_location_id and business_id = p_from_business_id
  ) then
    raise exception 'invalid sender location';
  end if;
  if not exists (
    select 1 from public.stock_locations
    where id = p_to_location_id and business_id = p_to_business_id
  ) then
    raise exception 'invalid receiver location';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no items to transfer';
  end if;
  if p_sent_by_name is null or length(trim(p_sent_by_name)) = 0 then
    raise exception 'sent_by_name required';
  end if;

  select count(*) + 1 into v_seq
  from public.inter_unit_transfers
  where from_business_id = p_from_business_id and created_at::date = current_date;
  v_transfer_number := 'SJU-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.inter_unit_transfers (
    from_business_id, to_business_id, from_location_id, to_location_id,
    transfer_number, note, sent_by_name
  ) values (
    p_from_business_id, p_to_business_id, p_from_location_id, p_to_location_id,
    v_transfer_number, nullif(trim(coalesce(p_note, '')), ''), trim(p_sent_by_name)
  ) returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ingredient_id := (v_item ->> 'ingredient_id')::uuid;
    v_qty := (v_item ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid qty for item %', v_ingredient_id;
    end if;

    select * into v_ingredient
    from public.ingredients
    where id = v_ingredient_id and business_id = p_from_business_id and deleted_at is null;
    if not found then
      raise exception 'ingredient not found in sender business: %', v_ingredient_id;
    end if;

    select * into v_from_stock_row
    from public.ingredient_location_stock
    where location_id = p_from_location_id and ingredient_id = v_ingredient_id;
    v_from_stock_before := coalesce(v_from_stock_row.stock, 0);

    if v_from_stock_before < v_qty then
      raise exception 'stok % tidak cukup: tersedia %, diminta %', v_ingredient.name, v_from_stock_before, v_qty;
    end if;

    update public.ingredient_location_stock
    set stock = v_from_stock_before - v_qty, updated_at = now()
    where location_id = p_from_location_id and ingredient_id = v_ingredient_id;

    -- Cari bahan dengan nama sama (case/space-insensitive) di bisnis tujuan;
    -- kalau belum ada, buat baru mengikuti nama+satuan dari pengirim.
    select id into v_to_ingredient_id
    from public.ingredients
    where business_id = p_to_business_id
      and deleted_at is null
      and lower(trim(name)) = lower(trim(v_ingredient.name))
    limit 1;

    if v_to_ingredient_id is null then
      insert into public.ingredients (business_id, name, unit, stock, unit_cost, min_stock)
      values (p_to_business_id, v_ingredient.name, v_ingredient.unit, 0, coalesce(v_ingredient.unit_cost, 0), 0)
      returning id into v_to_ingredient_id;
    end if;

    select stock into v_to_stock_before
    from public.ingredient_location_stock
    where location_id = p_to_location_id and ingredient_id = v_to_ingredient_id;
    v_to_stock_before := coalesce(v_to_stock_before, 0);

    insert into public.ingredient_location_stock (business_id, location_id, ingredient_id, stock)
    values (p_to_business_id, p_to_location_id, v_to_ingredient_id, v_to_stock_before + v_qty)
    on conflict (location_id, ingredient_id)
    do update set stock = ingredient_location_stock.stock + v_qty, updated_at = now();

    v_line_amount := round(v_qty * coalesce(v_ingredient.unit_cost, 0), 2);
    v_total := v_total + v_line_amount;

    insert into public.inter_unit_transfer_items (
      transfer_id, from_ingredient_id, to_ingredient_id, item_name, unit, qty, unit_cost, amount
    ) values (
      v_transfer_id, v_ingredient_id, v_to_ingredient_id, v_ingredient.name, v_ingredient.unit,
      v_qty, coalesce(v_ingredient.unit_cost, 0), v_line_amount
    );

    insert into public.stock_adjustments (
      business_id, ingredient_id, location_id, item_name, unit,
      stock_before, stock_after, diff, reason
    ) values (
      p_from_business_id, v_ingredient_id, p_from_location_id, v_ingredient.name, v_ingredient.unit,
      v_from_stock_before, v_from_stock_before - v_qty, -v_qty, 'Kirim antar-unit ' || v_transfer_number
    );
    insert into public.stock_adjustments (
      business_id, ingredient_id, location_id, item_name, unit,
      stock_before, stock_after, diff, reason
    ) values (
      p_to_business_id, v_to_ingredient_id, p_to_location_id, v_ingredient.name, v_ingredient.unit,
      v_to_stock_before, v_to_stock_before + v_qty, v_qty, 'Terima antar-unit ' || v_transfer_number
    );
  end loop;

  update public.inter_unit_transfers set total_amount = v_total where id = v_transfer_id;

  -- Nilai barang yang dikirim jadi Piutang Antar-Unit di pengirim (Gudang
  -- Central "menagih" unit penerima), dan Hutang Antar-Unit di penerima --
  -- persis seperti Pembelian & Hutang biasa, cuma "suppliernya" bisnis
  -- sendiri (arahan user 2026-09-07).
  if v_total > 0 then
    perform private.post_journal(
      p_from_business_id, now(), 'Kirim antar-unit ' || v_transfer_number, 'transfer_antar_unit', v_transfer_id,
      jsonb_build_array(
        jsonb_build_object('account_code', '1-110', 'debit', v_total, 'credit', 0),
        jsonb_build_object('account_code', '1-200', 'debit', 0, 'credit', v_total)
      )
    );
    perform private.post_journal(
      p_to_business_id, now(), 'Terima antar-unit ' || v_transfer_number, 'transfer_antar_unit', v_transfer_id,
      jsonb_build_array(
        jsonb_build_object('account_code', '1-200', 'debit', v_total, 'credit', 0),
        jsonb_build_object('account_code', '2-110', 'debit', 0, 'credit', v_total)
      )
    );
  end if;

  return query select v_transfer_id, v_transfer_number;
end;
$$;

grant execute on function public.ship_inter_unit_transfer(
  uuid, uuid, uuid, uuid, jsonb, text, text
) to authenticated;
