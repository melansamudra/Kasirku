-- Approval PO berjenjang 2 level (Manager/Supervisor -> Owner final).
-- status (issued/approved/rejected) TIDAK diubah maknanya -- PO tetap
-- 'issued' selama masih menunggu approval level manapun, baru 'approved'
-- setelah level terakhir clear. Semua konsumen existing yang cek
-- status === 'approved' (GRN, widget PO menunggu diterima, print view)
-- otomatis benar untuk PO 1-level maupun 2-level tanpa perubahan lain.
alter table public.purchase_orders
  add column approval_levels smallint not null default 1
    check (approval_levels in (1, 2)),
  add column level1_approved_by_user_id uuid references auth.users (id) on delete set null,
  add column level1_approved_by text,
  add column level1_approved_at timestamptz;
