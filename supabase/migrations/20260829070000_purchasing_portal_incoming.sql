-- Portal Lokasi khusus Purchasing (Gudang Utama): 2 tile lama "Terima
-- Barang dari Gudang" & "Permintaan Barang" tidak relevan buat lokasi ini
-- (Gudang Utama tidak "terima dari dirinya sendiri", dan tim Purchasing
-- sudah punya akses dashboard langsung buat proses PR/PO). Diganti 1 tile
-- read-only "Yang Masuk" -- ringkasan Permintaan Barang dari lokasi lain
-- yang belum diproses + PO approved yang masih ada barang belum di-GRN.
-- Murni informasi (lihat saja dari HP), aksinya tetap lewat dashboard.
create or replace function public.get_purchasing_portal_incoming(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_incoming_requests jsonb;
  v_pending_pos jsonb;
begin
  select business_id into v_business_id from public.stock_locations where portal_slug = p_slug;
  if v_business_id is null then
    return null;
  end if;

  -- Permintaan Barang yang masih ada item fulfillment_source='pending' --
  -- belum ditandai "Ambil dari Gudang"/"Order ke Supplier" oleh Purchasing.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pr.id,
        'pr_number', pr.pr_number,
        'employee_name', pr.employee_name,
        'location_name', sl.name,
        'created_at', pr.created_at,
        'note', pr.note,
        'item_count', item_counts.total,
        'pending_count', item_counts.pending
      )
      order by pr.created_at asc
    ),
    '[]'::jsonb
  )
  into v_incoming_requests
  from public.purchase_requests pr
  left join public.stock_locations sl on sl.id = pr.location_id
  join lateral (
    select count(*) as total, count(*) filter (where pri.fulfillment_source = 'pending') as pending
    from public.purchase_request_items pri
    where pri.purchase_request_id = pr.id
  ) item_counts on true
  where pr.business_id = v_business_id and item_counts.pending > 0;

  -- PO approved yang masih ada barang belum di-GRN (pola sama section
  -- "PO Menunggu Diterima dari Supplier" di halaman bahan-baku Gudang Utama).
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', po.id,
        'po_number', po.po_number,
        'supplier_name', s.name,
        'outstanding_count', outstanding.cnt
      )
      order by po.created_at asc
    ),
    '[]'::jsonb
  )
  into v_pending_pos
  from public.purchase_orders po
  left join public.suppliers s on s.id = po.supplier_id
  join lateral (
    select count(*) as cnt
    from public.purchase_order_items poi
    where poi.purchase_order_id = po.id
      and (poi.qty - coalesce((
        select sum(gni.qty_received)
        from public.goods_receipt_note_items gni
        join public.goods_receipt_notes grn on grn.id = gni.grn_id
        where grn.purchase_order_id = po.id and gni.purchase_order_item_id = poi.id and gni.condition = 'ok'
      ), 0)) > 0.001
  ) outstanding on true
  where po.business_id = v_business_id and po.status = 'approved' and outstanding.cnt > 0;

  return jsonb_build_object('incoming_requests', v_incoming_requests, 'pending_pos', v_pending_pos);
end;
$$;

grant execute on function public.get_purchasing_portal_incoming(text) to anon, authenticated;
