-- Jembatan ringan lintas-bisnis: Surat Jalan MANUAL (manual_delivery_notes)
-- dari satu bisnis (mis. Llauk Nusantara) bisa "diterima" oleh bisnis LAIN
-- (mis. Dapur Produksi, toko terpisah) tanpa perlu penggabungan skema penuh.
-- Prinsipnya sama seperti selembar kertas Surat Jalan fisik: siapa pun yang
-- pegang kodenya bisa membacanya (get_manual_delivery_note_by_code, mirip
-- pola link publik lain di app ini) -- read-only, tidak mengubah apa pun.
-- Yang benar-benar menulis lintas-bisnis cuma satu langkah kecil dan sempit:
-- menandai "sudah diklaim oleh bisnis X" (claim_manual_delivery_note_by_code),
-- SEKALI dan atomik (update ... where received_by_business_id is null),
-- supaya 1 Surat Jalan tidak bisa dobel-diterima jadi dobel Pembelian.
-- Pencatatan Pembelian sungguhan tetap 100% di sisi penerima lewat
-- addPurchase yang sudah ada (lihat purchases/receive-delivery-note-actions.ts)
-- -- RPC di sini SENGAJA tidak ikut membuat baris purchases/ingredients,
-- supaya semua validasi & posting jurnal yang sudah teruji di addPurchase
-- tetap satu-satunya jalur, tidak diduplikasi di sini.

alter table public.manual_delivery_notes
  add column receive_code text,
  add column received_by_business_id uuid references public.businesses (id) on delete set null,
  add column received_at timestamptz;

update public.manual_delivery_notes
set receive_code = encode(extensions.gen_random_bytes(5), 'hex')
where receive_code is null;

alter table public.manual_delivery_notes
  alter column receive_code set not null,
  alter column receive_code set default encode(extensions.gen_random_bytes(5), 'hex'),
  add constraint manual_delivery_notes_receive_code_key unique (receive_code);

create index manual_delivery_notes_received_by_business_id_idx
  on public.manual_delivery_notes (received_by_business_id);

-- Baca isi Surat Jalan lewat kode-nya -- lintas bisnis BY DESIGN (siapa pun
-- yang login & tahu kodenya boleh baca, sama seperti pegang kertasnya).
-- Read-only, tidak ada perubahan data, jadi risikonya setara membaca surat
-- jalan fisik yang sudah dicetak.
create or replace function public.get_manual_delivery_note_by_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dn record;
  v_from_business_name text;
  v_received_business_name text;
  v_items jsonb;
begin
  select id, business_id, dn_number, destination, note, created_at, received_by_business_id, received_at
  into v_dn
  from public.manual_delivery_notes
  where receive_code = p_code;

  if not found then
    return null;
  end if;

  select name into v_from_business_name from public.businesses where id = v_dn.business_id;

  if v_dn.received_by_business_id is not null then
    select name into v_received_business_name from public.businesses where id = v_dn.received_by_business_id;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', item_name, 'unit', unit, 'qty', qty) order by sort_order),
    '[]'::jsonb
  )
  into v_items
  from public.manual_delivery_note_items
  where manual_delivery_note_id = v_dn.id;

  return jsonb_build_object(
    'dn_number', v_dn.dn_number,
    'from_business_name', v_from_business_name,
    'destination', v_dn.destination,
    'note', v_dn.note,
    'created_at', v_dn.created_at,
    'already_received', v_dn.received_by_business_id is not null,
    'received_by_business_name', v_received_business_name,
    'received_at', v_dn.received_at,
    'items', v_items
  );
end;
$$;

grant execute on function public.get_manual_delivery_note_by_code(text) to authenticated;

-- Klaim (tandai diterima) -- atomik, cuma berhasil sekali. Pemanggil harus
-- pemilik p_receiving_business_id (dicek manual di sini karena RPC ini
-- security definer lintas RLS by design, bukan lewat owns_business(business_id)
-- biasa yang menunjuk ke bisnis PENGIRIM).
create or replace function public.claim_manual_delivery_note_by_code(p_code text, p_receiving_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dn_id uuid;
begin
  if not private.owns_business(p_receiving_business_id) then
    raise exception 'not authorized';
  end if;

  update public.manual_delivery_notes
  set received_by_business_id = p_receiving_business_id,
      received_at = now()
  where receive_code = p_code
    and received_by_business_id is null
  returning id into v_dn_id;

  return v_dn_id;
end;
$$;

grant execute on function public.claim_manual_delivery_note_by_code(text, uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');
