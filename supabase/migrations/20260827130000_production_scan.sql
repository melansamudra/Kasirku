-- Catat Produksi lewat scan barcode, tanpa kertas: tim dapur scan barcode
-- bahan setengah jadi + isi jumlah lewat link publik (tanpa login), masuk
-- sebagai draft berstatus 'pending' — TIDAK langsung mengurangi/menambah
-- stok apa pun. Supervisor baru verifikasi lewat dashboard (halaman
-- Produksi), baru di situ stok benar-benar bergerak — sama alur dengan
-- Permintaan Resto (baru -> approve), tapi di sini nempel di tabel
-- production_runs yang sudah ada (bukan tabel terpisah), karena kolom yang
-- dibutuhkan (item, qty, catatan, siapa) sudah persis sama.
--
-- Baris yang dicatat lewat form dashboard "Catat Produksi" (recordProductionRun)
-- TIDAK berubah perilakunya — tetap langsung memotong stok saat insert, dan
-- otomatis dapat status default 'verified' karena tidak pernah butuh
-- verifikasi lagi (sudah "sah" begitu diinput oleh staf yang login).
alter table public.production_runs
  add column status text not null default 'verified' check (status in ('pending', 'verified', 'rejected')),
  add column reject_reason text;

alter table public.businesses
  add column production_scan_slug text unique default encode(extensions.gen_random_bytes(9), 'hex');

update public.businesses
set production_scan_slug = encode(extensions.gen_random_bytes(9), 'hex')
where production_scan_slug is null;

-- RPC baca: nama toko + katalog bahan setengah jadi (dengan barcode) +
-- karyawan aktif buat form scan publik.
create or replace function public.get_production_scan_info(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employees jsonb;
  v_items jsonb;
begin
  select id, name
  into v_business
  from public.businesses
  where production_scan_slug = p_slug and cost_control_enabled = true;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.created_at asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', s.id, 'name', s.name, 'unit', s.unit, 'stock', s.stock, 'barcode', s.barcode)
      order by s.name asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.semi_finished_items s
  where s.business_id = v_business.id and s.deleted_at is null;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'employees', v_employees,
    'items', v_items
  );
end;
$$;

grant execute on function public.get_production_scan_info(text) to anon, authenticated;

-- RPC tulis: submit draft produksi hasil scan. Item TIDAK bisa dibuat baru
-- dari form publik (sama pola dengan submit_outlet_request) — cuma boleh
-- pilih dari katalog Bahan Setengah Jadi yang sudah ada. Sengaja TIDAK
-- menyentuh stok atau production_run_consumptions sama sekali di sini —
-- itu baru terjadi saat verifyProductionRun (server action dashboard).
create or replace function public.submit_production_scan(
  p_slug text,
  p_item_id uuid,
  p_qty numeric,
  p_employee_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_item record;
  v_employee_name text;
  v_run_id uuid;
begin
  select id
  into v_business
  from public.businesses
  where production_scan_slug = p_slug and cost_control_enabled = true;

  if not found then
    raise exception 'business not found';
  end if;

  select id, name, unit
  into v_item
  from public.semi_finished_items
  where id = p_item_id and business_id = v_business.id and deleted_at is null;

  if not found then
    raise exception 'item not found';
  end if;

  if p_qty is null or p_qty <= 0 or p_qty > 999999 then
    raise exception 'invalid quantity';
  end if;

  v_employee_name := 'Tim Produksi';
  if p_employee_id is not null then
    select name into v_employee_name
    from public.employees
    where id = p_employee_id and business_id = v_business.id and active = true;

    if not found then
      raise exception 'employee not found';
    end if;
  end if;

  insert into public.production_runs
    (business_id, semi_finished_item_id, item_name, qty_produced, unit,
     produced_by_employee_id, produced_by_name, note, status)
  values
    (v_business.id, v_item.id, v_item.name, p_qty, v_item.unit,
     p_employee_id, v_employee_name, nullif(left(trim(coalesce(p_note, '')), 500), ''), 'pending')
  returning id into v_run_id;

  return v_run_id;
end;
$$;

grant execute on function public.submit_production_scan(text, uuid, numeric, uuid, text) to anon, authenticated;
