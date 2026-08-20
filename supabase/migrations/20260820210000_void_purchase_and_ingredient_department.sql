-- 1. Batalkan Pembelian — buat koreksi kalau ada pembelian salah input
-- (termasuk data uji coba). Bukan hapus baris, tapi ditandai voided +
-- otomatis membalik efeknya: kurangi stok bahan/produk yang sempat
-- bertambah, dan posting jurnal koreksi (kebalikan dari jurnal saat
-- pembelian dicatat). Kalau pembelian itu tadinya jadi "Catat sebagai
-- Pembelian" dari Permintaan Barang, link alokasinya juga dilepas biar
-- muncul lagi tombol "Catat sebagai Pembelian" (bisa dicatat ulang).
alter table public.purchases
  add column voided boolean not null default false,
  add column voided_at timestamptz,
  add column void_reason text;

-- 2. Pengelompokan bahan baku per departemen (dapur/bar/front) — biar admin
-- yang scan/lihat order langsung tahu ini buat dapur/bar/front yang mana.
-- Nullable/opsional, bahan yang belum dikelompokkan tetap tampil normal
-- (dianggap "Lainnya").
alter table public.ingredients
  add column department text check (department is null or department in ('dapur', 'bar', 'front'));

-- RPC form order publik ikut kirim department per bahan.
create or replace function public.get_purchase_request_info(p_slug text)
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
  select id, name, business_type
  into v_business
  from public.businesses
  where purchase_request_slug = p_slug;

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

  if v_business.business_type = 'fnb' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'unit', i.unit,
          'stock', i.stock,
          'department', i.department,
          'purchase_units', (
            select coalesce(
              jsonb_agg(jsonb_build_object('unitName', u.unit_name, 'conversion', u.conversion) order by u.unit_name asc),
              '[]'::jsonb
            )
            from public.ingredient_purchase_units u
            where u.ingredient_id = i.id
          )
        )
        order by i.name asc
      ),
      '[]'::jsonb
    )
    into v_items
    from public.ingredients i
    where i.business_id = v_business.id and i.deleted_at is null;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.name, 'unit', 'pcs', 'stock', p.stock, 'department', null, 'purchase_units', '[]'::jsonb)
        order by p.name asc
      ),
      '[]'::jsonb
    )
    into v_items
    from public.products p
    where p.business_id = v_business.id and p.deleted_at is null;
  end if;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'business_type', v_business.business_type,
    'employees', v_employees,
    'items', v_items
  );
end;
$$;
