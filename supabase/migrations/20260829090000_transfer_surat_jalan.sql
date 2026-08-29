-- Surat Jalan buat pengiriman Bahan Setengah Jadi (Dapur Produksi -> Kitchen/
-- Bar lewat Transfer Internal). Beda dari delivery_notes yang sudah ada
-- (khusus barang keluar Gudang Utama, RLS owns_business/dashboard-only) --
-- di sini semuanya publik/anon lewat portal_slug (staf Kirim tidak punya
-- login dashboard), jadi TIDAK butuh tabel/RLS terpisah: dn_number cukup
-- nempel langsung di location_transfers (1 baris = 1 pengiriman = 1 SJ,
-- beda dari delivery_notes yang granularitasnya per-batch/bisa gabung
-- banyak sumber sekaligus -- Transfer Internal selalu 1x kirim tuntas).
alter table public.location_transfers add column dn_number text;

create or replace function public.fulfill_location_transfer_public(
  p_slug text,
  p_employee_id uuid,
  p_transfer_id uuid,
  p_qty_sent jsonb -- array of {itemId, qty}
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_employee record;
  v_transfer record;
  v_row jsonb;
  v_item record;
  v_qty numeric(12, 2);
  v_source_stock numeric(12, 2);
  v_dest_stock numeric(12, 2);
  v_any_sent boolean := false;
  v_dn_number text;
begin
  select business_id into v_business_id from public.stock_locations where portal_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select id, name into v_employee
  from public.employees
  where id = p_employee_id and business_id = v_business_id and active = true;
  if not found then
    raise exception 'employee not found';
  end if;

  select id, from_location_id, to_location_id, status into v_transfer
  from public.location_transfers
  where id = p_transfer_id and business_id = v_business_id;
  if not found then
    raise exception 'transfer not found';
  end if;
  if v_transfer.status != 'baru' then
    raise exception 'already fulfilled';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_qty_sent, '[]'::jsonb))
  loop
    v_qty := (v_row ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      continue;
    end if;

    select id, semi_finished_item_id, item_name, unit into v_item
    from public.location_transfer_items
    where id = (v_row ->> 'itemId')::uuid and transfer_id = p_transfer_id;
    if not found then
      continue;
    end if;

    select stock into v_source_stock
    from public.semi_finished_item_location_stock
    where business_id = v_business_id and location_id = v_transfer.from_location_id
      and semi_finished_item_id = v_item.semi_finished_item_id;
    v_source_stock := coalesce(v_source_stock, 0);
    if v_source_stock < v_qty then
      raise exception 'insufficient stock: %', v_item.item_name;
    end if;

    select stock into v_dest_stock
    from public.semi_finished_item_location_stock
    where business_id = v_business_id and location_id = v_transfer.to_location_id
      and semi_finished_item_id = v_item.semi_finished_item_id;
    v_dest_stock := coalesce(v_dest_stock, 0);

    insert into public.semi_finished_item_location_stock
      (business_id, location_id, semi_finished_item_id, stock, updated_at)
    values (v_business_id, v_transfer.from_location_id, v_item.semi_finished_item_id, v_source_stock - v_qty, now())
    on conflict (location_id, semi_finished_item_id) do update set stock = excluded.stock, updated_at = excluded.updated_at;

    insert into public.semi_finished_item_location_stock
      (business_id, location_id, semi_finished_item_id, stock, updated_at)
    values (v_business_id, v_transfer.to_location_id, v_item.semi_finished_item_id, v_dest_stock + v_qty, now())
    on conflict (location_id, semi_finished_item_id) do update set stock = excluded.stock, updated_at = excluded.updated_at;

    insert into public.stock_adjustments
      (business_id, semi_finished_item_id, location_id, item_name, unit, stock_before, stock_after, diff, reason)
    values
      (v_business_id, v_item.semi_finished_item_id, v_transfer.from_location_id, v_item.item_name, v_item.unit,
       v_source_stock, v_source_stock - v_qty, -v_qty, 'Transfer keluar (portal, oleh ' || v_employee.name || ')'),
      (v_business_id, v_item.semi_finished_item_id, v_transfer.to_location_id, v_item.item_name, v_item.unit,
       v_dest_stock, v_dest_stock + v_qty, v_qty, 'Transfer masuk (portal, oleh ' || v_employee.name || ')');

    update public.location_transfer_items set qty_sent = v_qty where id = v_item.id;
    v_any_sent := true;
  end loop;

  if not v_any_sent then
    raise exception 'nothing sent';
  end if;

  v_dn_number := 'SJ-' || to_char(now(), 'YYYYMMDD') || '-' || right(replace(p_transfer_id::text, '-', ''), 6);

  update public.location_transfers
  set status = 'dikirim', fulfilled_at = now(), fulfilled_by_name = v_employee.name, dn_number = v_dn_number
  where id = p_transfer_id;

  return jsonb_build_object('ok', true, 'dn_number', v_dn_number);
end;
$$;

grant execute on function public.fulfill_location_transfer_public(text, uuid, uuid, jsonb) to anon, authenticated;

-- Riwayat pengiriman (status='dikirim') dari lokasi pengirim -- dipanggil
-- dari halaman "Riwayat Kirim" Portal Dapur Produksi.
create or replace function public.get_location_portal_transfer_history(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_location_id uuid;
  v_transfers jsonb;
begin
  select business_id, id into v_business_id, v_location_id
  from public.stock_locations where portal_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'dn_number', t.dn_number,
        'to_location_name', tl.name,
        'fulfilled_by_name', t.fulfilled_by_name,
        'fulfilled_at', t.fulfilled_at,
        'item_count', (select count(*) from public.location_transfer_items i where i.transfer_id = t.id)
      )
      order by t.fulfilled_at desc
    ),
    '[]'::jsonb
  )
  into v_transfers
  from public.location_transfers t
  join public.stock_locations tl on tl.id = t.to_location_id
  where t.business_id = v_business_id and t.from_location_id = v_location_id and t.status = 'dikirim'
  limit 100;

  return jsonb_build_object('transfers', v_transfers);
end;
$$;

grant execute on function public.get_location_portal_transfer_history(text) to anon, authenticated;

-- Detail 1 pengiriman buat dicetak sebagai Surat Jalan -- publik lewat
-- portal_slug lokasi PENGIRIM (Dapur Produksi), tervalidasi transfer itu
-- memang berangkat dari lokasi tsb.
create or replace function public.get_location_transfer_delivery_note(p_slug text, p_transfer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_location_id uuid;
  v_transfer record;
  v_from_name text;
  v_to_name text;
  v_items jsonb;
begin
  select business_id, id into v_business_id, v_location_id
  from public.stock_locations where portal_slug = p_slug;
  if v_business_id is null then
    return null;
  end if;

  select id, from_location_id, to_location_id, dn_number, fulfilled_by_name, fulfilled_at, status
  into v_transfer
  from public.location_transfers
  where id = p_transfer_id and business_id = v_business_id and from_location_id = v_location_id;
  if not found or v_transfer.status != 'dikirim' then
    return null;
  end if;

  select name into v_from_name from public.stock_locations where id = v_transfer.from_location_id;
  select name into v_to_name from public.stock_locations where id = v_transfer.to_location_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('item_name', i.item_name, 'unit', i.unit, 'qty_sent', i.qty_sent) order by i.id),
    '[]'::jsonb
  )
  into v_items
  from public.location_transfer_items i
  where i.transfer_id = v_transfer.id;

  return jsonb_build_object(
    'dn_number', v_transfer.dn_number,
    'from_location_name', v_from_name,
    'to_location_name', v_to_name,
    'fulfilled_by_name', v_transfer.fulfilled_by_name,
    'fulfilled_at', v_transfer.fulfilled_at,
    'items', v_items
  );
end;
$$;

grant execute on function public.get_location_transfer_delivery_note(text, uuid) to anon, authenticated;
