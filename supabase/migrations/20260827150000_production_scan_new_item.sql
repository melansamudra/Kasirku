-- Kadang tim dapur bikin bahan setengah jadi yang belum pernah tercatat di
-- katalog (belum ada resep/HPP-nya). Sebelum ini, form scan cuma bisa pilih
-- dari katalog yang sudah ada. Sekarang boleh juga ketik nama + satuan baru
-- kalau memang belum ada -- tapi TETAP masuk sebagai draft 'pending', TANPA
-- semi_finished_item_id (belum terhubung ke katalog mana pun). Supervisor
-- yang memutuskan di halaman Verifikasi: gabungkan ke item lama yang sudah
-- ada, atau buat item baru -- baru sesudah itu proses verifikasi/stok jalan
-- seperti biasa (lewat linkPendingProductionToExistingItem /
-- createItemForPendingProduction di actions.ts, bukan RPC ini).
create or replace function public.submit_production_scan(
  p_slug text,
  p_item_id uuid,
  p_qty numeric,
  p_employee_id uuid,
  p_note text,
  p_new_item_name text default null,
  p_new_item_unit text default null
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
  v_item_name text;
  v_unit text;
begin
  select id
  into v_business
  from public.businesses
  where production_scan_slug = p_slug and cost_control_enabled = true;

  if not found then
    raise exception 'business not found';
  end if;

  if p_item_id is not null then
    select id, name, unit
    into v_item
    from public.semi_finished_items
    where id = p_item_id and business_id = v_business.id and deleted_at is null;

    if not found then
      raise exception 'item not found';
    end if;

    v_item_name := v_item.name;
    v_unit := v_item.unit;
  else
    if p_new_item_name is null or length(trim(p_new_item_name)) = 0 then
      raise exception 'item name required';
    end if;
    if p_new_item_unit is null or length(trim(p_new_item_unit)) = 0 then
      raise exception 'unit required';
    end if;
    v_item_name := trim(p_new_item_name);
    v_unit := trim(p_new_item_unit);
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
    (v_business.id, p_item_id, v_item_name, p_qty, v_unit,
     p_employee_id, v_employee_name, nullif(left(trim(coalesce(p_note, '')), 500), ''), 'pending')
  returning id into v_run_id;

  return v_run_id;
end;
$$;

grant execute on function public.submit_production_scan(text, uuid, numeric, uuid, text, text, text) to anon, authenticated;

-- Signature lama (tanpa 2 parameter baru) sudah tidak dipakai form manapun
-- lagi -- dihapus supaya tidak ada 2 overload yang membingungkan.
drop function if exists public.submit_production_scan(text, uuid, numeric, uuid, text);
