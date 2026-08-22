-- Kas Kecil: kasir catat pengeluaran petty cash (kategori kasar + foto nota),
-- tapi TIDAK langsung masuk Laporan Laba Rugi/Neraca — nyangkut dulu di akun
-- suspense "1-050 Kas Kecil Menunggu Klasifikasi" (aset) sampai admin
-- me-review, memilih akun beban yang tepat, dan approve. Baru di titik itu
-- dampaknya masuk laporan besar (Laba Rugi cuma tampilkan akun
-- pendapatan/beban, lihat accounting/laba-rugi/page.tsx).
--
-- Kenapa tetap posting jurnal di awal (bukan ditunda sampai approved): karena
-- close_shift() menghitung expected_cash dari total jurnal akun 1-001
-- (source='shift') per shift — kalau kas keluar tidak diposting sama sekali
-- sampai admin approve (yang realistis baru terjadi setelah shift tutup),
-- rekonsiliasi kas fisik kasir jadi salah (seolah uang petty cash yang sudah
-- dibelanjakan masih ada di laci). Posting ke akun suspense menyelesaikan
-- dua kebutuhan itu sekaligus.

-- Akun suspense baru untuk tiap business (existing + baru lewat seed function)
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
    (p_business_id, '1-100', 'Piutang Usaha', 'aset', 'debit', true),
    (p_business_id, '1-200', 'Persediaan', 'aset', 'debit', true),
    (p_business_id, '1-500', 'Peralatan', 'aset', 'debit', true),
    (p_business_id, '1-501', 'Akumulasi Penyusutan', 'aset', 'debit', true),
    (p_business_id, '2-001', 'Utang Dagang', 'kewajiban', 'kredit', true),
    (p_business_id, '2-100', 'Utang Gaji', 'kewajiban', 'kredit', true),
    (p_business_id, '2-200', 'PPN Keluaran (Utang Pajak)', 'kewajiban', 'kredit', true),
    (p_business_id, '3-001', 'Modal Pemilik', 'modal', 'kredit', true),
    (p_business_id, '3-100', 'Laba Ditahan', 'modal', 'kredit', true),
    (p_business_id, '4-001', 'Pendapatan Penjualan', 'pendapatan', 'kredit', true),
    (p_business_id, '4-002', 'Pendapatan Tiket', 'pendapatan', 'kredit', true),
    (p_business_id, '4-999', 'Pendapatan Lain-lain', 'pendapatan', 'kredit', true),
    (p_business_id, '5-001', 'Beban Pokok Penjualan (HPP)', 'beban', 'debit', true),
    (p_business_id, '5-100', 'Beban Gaji', 'beban', 'debit', true),
    (p_business_id, '5-101', 'Beban Listrik & Air', 'beban', 'debit', true),
    (p_business_id, '5-102', 'Beban Sewa', 'beban', 'debit', true),
    (p_business_id, '5-103', 'Beban Marketing', 'beban', 'debit', true),
    (p_business_id, '5-104', 'Beban Perlengkapan', 'beban', 'debit', true),
    (p_business_id, '5-105', 'Beban Penyusutan', 'beban', 'debit', true),
    (p_business_id, '5-999', 'Beban Lain-lain', 'beban', 'debit', true)
  on conflict (business_id, code) do nothing;
end;
$$;

-- Backfill: business yang sudah ada belum punya 1-050.
do $$
declare
  v_business record;
begin
  for v_business in select id from public.businesses loop
    perform private.seed_default_accounts(v_business.id);
  end loop;
end $$;

alter table public.journal_entries drop constraint if exists journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'penjualan', 'void', 'pembelian', 'beban', 'payroll', 'tutup_buku', 'koreksi', 'shift', 'kas_kecil'));

-- Satu baris per pergerakan kas kecil: origin='kasir' datang dari POS
-- (terikat shift), origin='admin' diinput langsung oleh admin (mis. nota
-- supplier yang datang belakangan) dan tidak terikat shift.
create table public.shift_cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shift_id uuid references public.shifts (id) on delete cascade,
  cashier_id uuid references public.cashiers (id),
  origin text not null default 'kasir' check (origin in ('kasir', 'admin')),
  direction text not null check (direction in ('in', 'out')),
  amount numeric(12, 2) not null check (amount > 0),
  category text,
  description text not null,
  receipt_url text,
  -- Status hanya relevan untuk direction='out': 'pending' sampai admin
  -- memutuskan, lalu 'posted' (di-approve & direklas ke akun beban) atau
  -- 'rejected'. direction='in' langsung 'posted' (tidak perlu diklasifikasi).
  status text not null default 'pending' check (status in ('pending', 'posted', 'rejected')),
  account_code text, -- akun beban final, diisi admin saat approve
  journal_entry_id uuid references public.journal_entries (id) on delete set null,
  reclass_journal_entry_id uuid references public.journal_entries (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint shift_cash_movements_origin_shift_chk check (
    (origin = 'kasir' and shift_id is not null and cashier_id is not null)
    or (origin = 'admin' and shift_id is null)
  )
);

create index shift_cash_movements_shift_id_idx on public.shift_cash_movements (shift_id);
create index shift_cash_movements_journal_entry_id_idx on public.shift_cash_movements (journal_entry_id);
create index shift_cash_movements_business_id_status_idx on public.shift_cash_movements (business_id, status);

alter table public.shift_cash_movements enable row level security;

create policy "Owner manages shift cash movements of own businesses"
on public.shift_cash_movements for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- post_shift_cash_movement: dipanggil dari POS. direction='in' (top-up petty
-- cash) tetap auto-post seperti sebelumnya. direction='out' (belanja pakai
-- petty cash) sekarang nyangkut di akun suspense 1-050, status='pending'.
create or replace function public.post_shift_cash_movement(
  p_business_id uuid,
  p_shift_id uuid,
  p_direction text, -- 'in' | 'out'
  p_amount numeric,
  p_description text,
  p_category text default null,
  p_receipt_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_movement_id uuid;
  v_cashier_id uuid;
  v_lines jsonb;
  v_account_code text;
  v_status text;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_direction not in ('in', 'out') then
    raise exception 'invalid direction';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'description required';
  end if;

  select s.cashier_id into v_cashier_id
  from public.shifts s
  where s.id = p_shift_id and s.business_id = p_business_id and s.closed_at is null;

  if not found then
    raise exception 'shift not found or already closed';
  end if;

  if p_direction = 'in' then
    v_account_code := '4-999';
    v_status := 'posted';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '1-001', 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', v_account_code, 'debit', 0, 'credit', p_amount)
    );
  else
    v_account_code := null; -- ditentukan admin saat approve
    v_status := 'pending';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '1-050', 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', p_amount)
    );
  end if;

  v_entry_id := private.post_journal(
    p_business_id, now(), p_description, 'shift', p_shift_id, v_lines
  );

  insert into public.shift_cash_movements (
    business_id, shift_id, cashier_id, origin, direction, amount, category, description,
    receipt_url, status, account_code, journal_entry_id
  ) values (
    p_business_id, p_shift_id, v_cashier_id, 'kasir', p_direction, p_amount, p_category, p_description,
    p_receipt_url, v_status, v_account_code, v_entry_id
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

grant execute on function public.post_shift_cash_movement(uuid, uuid, text, numeric, text, text, text) to authenticated;

-- Admin input pengeluaran langsung (mis. nota supplier yang datang
-- belakangan) — tidak terikat shift, tetap masuk antrian approval yang sama
-- (posting awal ke suspense, baru direklas saat di-approve) supaya satu
-- alur konsisten, bukan dua standar (satu langsung, satu tertunda).
create or replace function public.post_petty_cash_expense(
  p_business_id uuid,
  p_amount numeric,
  p_description text,
  p_category text default null,
  p_receipt_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_movement_id uuid;
  v_lines jsonb;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'description required';
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1-050', 'debit', p_amount, 'credit', 0),
    jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', p_amount)
  );

  v_entry_id := private.post_journal(
    p_business_id, now(), p_description, 'kas_kecil', null, v_lines
  );

  insert into public.shift_cash_movements (
    business_id, shift_id, cashier_id, origin, direction, amount, category, description,
    receipt_url, status, journal_entry_id, created_by_user_id
  ) values (
    p_business_id, null, null, 'admin', 'out', p_amount, p_category, p_description,
    p_receipt_url, 'pending', v_entry_id, auth.uid()
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

grant execute on function public.post_petty_cash_expense(uuid, numeric, text, text, text) to authenticated;

-- Admin approve/reject satu movement pending. Approve: reklas dari suspense
-- (1-050) ke akun beban pilihan admin. Reject: uang "kembali" ke kas (1-001)
-- — kasir perlu klarifikasi/ganti selisih fisik kalau memang sudah terpakai.
create or replace function public.review_shift_cash_movement(
  p_movement_id uuid,
  p_decision text, -- 'approve' | 'reject'
  p_account_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement record;
  v_entry_id uuid;
  v_lines jsonb;
begin
  select * into v_movement
  from public.shift_cash_movements
  where id = p_movement_id;

  if not found then
    raise exception 'movement not found';
  end if;

  if not private.owns_business(v_movement.business_id) then
    raise exception 'not authorized';
  end if;

  if v_movement.direction != 'out' then
    raise exception 'only kas keluar movements can be reviewed';
  end if;

  if v_movement.status != 'pending' then
    raise exception 'movement already reviewed';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'approve' then
    if p_account_code is null or length(trim(p_account_code)) = 0 then
      raise exception 'account_code required to approve';
    end if;

    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', p_account_code, 'debit', v_movement.amount, 'credit', 0),
      jsonb_build_object('account_code', '1-050', 'debit', 0, 'credit', v_movement.amount)
    );

    v_entry_id := private.post_journal(
      v_movement.business_id, now(),
      'Klasifikasi kas kecil: ' || v_movement.description,
      'kas_kecil', v_movement.id, v_lines
    );

    update public.shift_cash_movements
    set status = 'posted',
        account_code = p_account_code,
        reclass_journal_entry_id = v_entry_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_movement_id;
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '1-001', 'debit', v_movement.amount, 'credit', 0),
      jsonb_build_object('account_code', '1-050', 'debit', 0, 'credit', v_movement.amount)
    );

    v_entry_id := private.post_journal(
      v_movement.business_id, now(),
      'Tolak kas kecil: ' || v_movement.description,
      'kas_kecil', v_movement.id, v_lines
    );

    update public.shift_cash_movements
    set status = 'rejected',
        reclass_journal_entry_id = v_entry_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_movement_id;
  end if;

  return v_entry_id;
end;
$$;

grant execute on function public.review_shift_cash_movement(uuid, text, text) to authenticated;

-- Storage bucket untuk foto nota pengeluaran kas kecil (maks 2 MB, public read)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cash-receipts',
  'cash-receipts',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Owner can upload cash receipts"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cash-receipts'
  and private.owns_business((string_to_array(name, '/'))[1]::uuid)
);

create policy "Owner can delete cash receipts"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'cash-receipts'
  and private.owns_business((string_to_array(name, '/'))[1]::uuid)
);

create policy "Anyone can view cash receipts"
on storage.objects for select
using (bucket_id = 'cash-receipts');
