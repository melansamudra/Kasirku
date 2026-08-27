-- User laporan: input "Scan Barcode" di halaman publik /produksi-scan tidak
-- kepakai (tim dapur pakai HP tanpa scanner fisik, cuma pilih manual) --
-- disembunyikan di sisi client. Sebagai gantinya mereka minta pratinjau
-- "bahan yang akan terpakai" (sama seperti di form dashboard Catat Produksi)
-- ikut muncul di HP, supaya kelihatan kalau ada selisih/kekurangan stok bahan
-- SEBELUM dikirim ke supervisor untuk verifikasi.
--
-- get_production_scan_info sekarang ikut kirim breakdown resep (langsung,
-- level 1 saja -- sama seperti tampilan dashboard) + stok saat ini per
-- komponen, supaya halaman publik bisa hitung "qty x jumlah diproduksi" di
-- sisi client tanpa perlu RPC tambahan.
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
      jsonb_build_object(
        'id', s.id, 'name', s.name, 'unit', s.unit, 'stock', s.stock, 'barcode', s.barcode,
        'recipe', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'name', case when r.component_type = 'ingredient' then ing.name else comp.name end,
                'qtyPerUnit', r.qty,
                'unit', r.unit,
                'availableStock', case when r.component_type = 'ingredient' then ing.stock else comp.stock end
              )
              order by case when r.component_type = 'ingredient' then ing.name else comp.name end
            ),
            '[]'::jsonb
          )
          from public.semi_finished_recipes r
          left join public.ingredients ing on ing.id = r.ingredient_id
          left join public.semi_finished_items comp on comp.id = r.component_semi_finished_id
          where r.semi_finished_item_id = s.id
        )
      )
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
