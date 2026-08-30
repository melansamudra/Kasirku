-- Perbaikan 2 celah dari audit cost-control (2026-08-31):
--
-- 1. PO yang DIGABUNG (barang baru ditambahkan ke PO "issued" yang sama oleh
--    akun BERBEDA dari penerbit pertama, lihat forwardAllocationsToSupplier)
--    sebelumnya cuma mencatat 1 `issued_by_user_id` -- akun kedua yang ikut
--    menambahkan barang tidak pernah tercatat, sehingga bisa lolos approve
--    PO yang sebagian isinya dia sendiri minta. Tabel baru
--    `purchase_order_contributors` mencatat SEMUA akun yang pernah
--    menerbitkan/menambah barang ke satu PO -- approve memblokir siapa pun
--    yang ada di daftar ini, bukan cuma `issued_by_user_id` tunggal.
-- 2. PO lama (dibuat sebelum kolom `issued_by_user_id` ada, jadi NULL) bikin
--    pengecekan "tidak bisa approve PO sendiri" diam-diam DILEWATI TOTAL
--    (short-circuit `&&`). Tidak ditambah kolom baru untuk ini -- perbaikan
--    logikanya di approvePurchaseOrder (kode), murni fail-closed: PO dengan
--    issued_by_user_id NULL cuma bisa di-approve Owner.
create table public.purchase_order_contributors (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (purchase_order_id, user_id)
);

create index purchase_order_contributors_po_id_idx on public.purchase_order_contributors (purchase_order_id);

alter table public.purchase_order_contributors enable row level security;

create policy "Owner manages PO contributors of own businesses"
on public.purchase_order_contributors for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

-- Sekalian tutup 2 celah SEJENIS yang ditemukan audit yang sama: approval
-- budget PR per item & pencatatan penerima GRN masih pakai dropdown nama
-- bebas dari tabel `employees` (tidak terikat sesi login sama sekali),
-- padahal approve/reject PO sudah dipindah ke akun login sejak
-- 20260830170000_po_approval_identity.sql. Pola sama: kolom teks lama tetap
-- ada buat tampilan, kolom `_user_id` baru buat identitas server-side.
alter table public.purchase_request_items
  add column budget_approved_by_user_id uuid references auth.users (id) on delete set null;

alter table public.goods_receipt_notes
  add column received_by_user_id uuid references auth.users (id) on delete set null;
