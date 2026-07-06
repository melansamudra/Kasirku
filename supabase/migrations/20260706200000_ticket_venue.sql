-- Module: business type 'tiket' — tiket masuk untuk tempat wisata/arena.
-- Model terpisah dari products/transactions: bukan produk, tapi tiket
-- bernomor seri per kategori (kontinu, tidak pernah reset). Harga tergantung
-- hari (weekday/libur) atau status member. Reuse cashiers/shifts/pengaturan
-- pajak-service yang sudah ada di businesses — tidak ada konsep baru di sana.

alter table public.businesses
  drop constraint if exists businesses_business_type_check;

alter table public.businesses
  add constraint businesses_business_type_check
  check (business_type in ('fnb', 'retail', 'tiket'));

-- Kategori tiket ------------------------------------------------------------
-- Dikonfigurasi bebas oleh owner (mis. "Pengunjung", "Penunggu"). Tiap
-- kategori punya sequence serial sendiri lewat next_serial (dikunci FOR
-- UPDATE saat checkout supaya aman dari race condition — beda dari
-- invoice_number di modul lain yang pakai count(*), karena serial ini harus
-- direkonsiliasi ke tiket fisik jadi wajib benar-benar unik).

create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  price_weekday numeric(12, 2) not null default 0,
  price_holiday numeric(12, 2) not null default 0,
  member_price numeric(12, 2) not null default 0,
  next_serial int not null default 1,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index ticket_categories_business_id_idx on public.ticket_categories (business_id);
create unique index ticket_categories_business_id_name_key
  on public.ticket_categories (business_id, name)
  where deleted_at is null;

alter table public.ticket_categories enable row level security;

create policy "Owner manages ticket categories of own businesses"
on public.ticket_categories for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Kalender libur --------------------------------------------------------
-- Tanggal yang ditandai manual (mis. libur nasional/cuti bersama) yang ikut
-- dihitung sebagai "hari libur" selain Sabtu-Minggu otomatis.

create table public.ticket_holidays (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  holiday_date date not null,
  label text,
  created_at timestamptz not null default now(),
  unique (business_id, holiday_date)
);

create index ticket_holidays_business_id_idx on public.ticket_holidays (business_id);

alter table public.ticket_holidays enable row level security;

create policy "Owner manages ticket holidays of own businesses"
on public.ticket_holidays for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Member ----------------------------------------------------------------
-- Berbeda dari tabel `customers` yang sudah ada (riwayat pembelian
-- walk-in) — ini pelanggan berlangganan/berkartu dengan masa berlaku.

create table public.members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  member_code text not null,
  name text not null,
  phone text,
  valid_from date not null,
  valid_until date not null,
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index members_business_id_idx on public.members (business_id);
create unique index members_business_id_member_code_key
  on public.members (business_id, member_code)
  where deleted_at is null;

alter table public.members enable row level security;

create policy "Owner manages members of own businesses"
on public.members for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Ticket transactions (header) ------------------------------------------
-- Mirip public.transactions tapi untuk penjualan tiket — sengaja dipisah
-- (bukan union ke transactions) karena tidak ada konsep HPP/COGS untuk tiket
-- masuk, dan halaman laporan yang sudah ada tetap scoped ke transactions.

create table public.ticket_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shift_id uuid references public.shifts (id) on delete set null,
  cashier_id uuid not null references public.cashiers (id),
  member_id uuid references public.members (id) on delete set null,
  invoice_number text not null,
  date timestamptz not null default now(),
  is_holiday boolean not null default false,
  subtotal numeric(12, 2) not null default 0,
  service numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment_method text not null,
  received numeric(12, 2),
  change numeric(12, 2) not null default 0,
  voided boolean not null default false,
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references public.cashiers (id),
  constraint ticket_transactions_business_id_invoice_number_key
    unique (business_id, invoice_number)
);

create index ticket_transactions_business_id_date_idx
  on public.ticket_transactions (business_id, date);
create index ticket_transactions_shift_id_idx on public.ticket_transactions (shift_id);
create index ticket_transactions_member_id_idx on public.ticket_transactions (member_id);

alter table public.ticket_transactions enable row level security;

create policy "Owner manages ticket transactions of own businesses"
on public.ticket_transactions for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Ticket serials (satu baris = satu tiket fisik) -------------------------
-- Tidak perlu tabel line-item terpisah: harga & kategori langsung snapshot
-- di tiap baris serial karena satu baris memang satu tiket = satu harga.
-- serial_no unik per (business_id, ticket_category_id) — sequence yang
-- kontinu & tidak reset. voided ada di header (ticket_transactions), serial
-- tetap dialokasikan permanen walau transaksinya di-void (tiket fisik sudah
-- terlanjur dicetak/diberikan).

create table public.ticket_serials (
  id uuid primary key default gen_random_uuid(),
  ticket_transaction_id uuid not null references public.ticket_transactions (id) on delete cascade,
  ticket_category_id uuid not null references public.ticket_categories (id),
  business_id uuid not null references public.businesses (id) on delete cascade,
  serial_no int not null,
  price numeric(12, 2) not null,
  is_member_price boolean not null default false,
  constraint ticket_serials_business_id_category_id_serial_no_key
    unique (business_id, ticket_category_id, serial_no)
);

create index ticket_serials_ticket_transaction_id_idx
  on public.ticket_serials (ticket_transaction_id);
create index ticket_serials_category_serial_idx
  on public.ticket_serials (ticket_category_id, serial_no);

alter table public.ticket_serials enable row level security;

create policy "Owner manages ticket serials of own transactions"
on public.ticket_serials for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- checkout_ticket_transaction RPC -----------------------------------------
-- p_items: array of {ticket_category_id, qty}. Hari libur dihitung DI DALAM
-- RPC (bukan dipercaya dari client) supaya tidak bisa dipalsukan dan tetap
-- benar walau tanggal lokal di browser meleset.

create or replace function public.checkout_ticket_transaction(
  p_business_id uuid,
  p_cashier_id uuid,
  p_items jsonb, -- array of {ticket_category_id, qty}
  p_payment_method text,
  p_received numeric default null,
  p_member_id uuid default null
)
returns table (transaction_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_member record;
  v_invoice_number text;
  v_seq int;
  v_is_holiday boolean;
  v_subtotal numeric(12, 2) := 0;
  v_service numeric(12, 2) := 0;
  v_tax numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_change numeric(12, 2);
  v_transaction_id uuid;
  v_shift_id uuid;
  v_item jsonb;
  v_category_id uuid;
  v_category record;
  v_qty int;
  v_use_member_price boolean := false;
  v_unit_price numeric(12, 2);
  v_serial int;
  i int;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.cashiers c
    where c.id = p_cashier_id and c.business_id = p_business_id and c.active
  ) then
    raise exception 'invalid cashier';
  end if;

  if p_payment_method is null or length(trim(p_payment_method)) = 0 then
    raise exception 'payment method required';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
  end if;

  select b.tax_enabled, b.tax_rate, b.service_enabled, b.service_rate
  into v_business
  from public.businesses b
  where b.id = p_business_id;

  select id into v_shift_id
  from public.shifts
  where business_id = p_business_id and closed_at is null
  limit 1;

  if v_shift_id is null then
    raise exception 'no active shift — open a shift before selling';
  end if;

  if p_member_id is not null then
    select m.id, m.valid_from, m.valid_until
    into v_member
    from public.members m
    where m.id = p_member_id
      and m.business_id = p_business_id
      and m.deleted_at is null;

    if not found then
      raise exception 'member not found';
    end if;

    if current_date < v_member.valid_from or current_date > v_member.valid_until then
      raise exception 'membership tidak aktif (kadaluarsa atau belum berlaku)';
    end if;

    v_use_member_price := true;
  end if;

  v_is_holiday := extract(dow from current_date) in (0, 6)
    or exists (
      select 1 from public.ticket_holidays h
      where h.business_id = p_business_id and h.holiday_date = current_date
    );

  select count(*) + 1 into v_seq
  from public.ticket_transactions t
  where t.business_id = p_business_id
    and t.date::date = current_date;

  v_invoice_number := 'TIX-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.ticket_transactions (
    business_id, shift_id, cashier_id, member_id, invoice_number, date,
    is_holiday, subtotal, service, tax, total, payment_method, received, change
  ) values (
    p_business_id, v_shift_id, p_cashier_id, p_member_id, v_invoice_number, now(),
    v_is_holiday, 0, 0, 0, 0, p_payment_method, p_received, 0
  )
  returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_category_id := (v_item ->> 'ticket_category_id')::uuid;
    v_qty := (v_item ->> 'qty')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;

    select * into v_category
    from public.ticket_categories
    where id = v_category_id
      and business_id = p_business_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'ticket category not found: %', v_category_id;
    end if;

    v_unit_price := case
      when v_use_member_price then v_category.member_price
      when v_is_holiday then v_category.price_holiday
      else v_category.price_weekday
    end;

    for i in 1..v_qty loop
      v_serial := v_category.next_serial;

      insert into public.ticket_serials (
        ticket_transaction_id, ticket_category_id, business_id,
        serial_no, price, is_member_price
      ) values (
        v_transaction_id, v_category_id, p_business_id,
        v_serial, v_unit_price, v_use_member_price
      );

      v_category.next_serial := v_category.next_serial + 1;
      v_subtotal := v_subtotal + v_unit_price;
    end loop;

    update public.ticket_categories
    set next_serial = v_category.next_serial
    where id = v_category_id;
  end loop;

  if v_business.service_enabled then
    v_service := round(v_subtotal * v_business.service_rate / 100);
  end if;

  if v_business.tax_enabled then
    v_tax := round((v_subtotal + v_service) * v_business.tax_rate / 100);
  end if;

  v_total := v_subtotal + v_service + v_tax;
  v_change := greatest(coalesce(p_received, v_total) - v_total, 0);

  update public.ticket_transactions
  set subtotal = v_subtotal,
      service = v_service,
      tax = v_tax,
      total = v_total,
      change = v_change
  where id = v_transaction_id;

  return query select v_transaction_id, v_invoice_number;
end;
$$;

grant execute on function public.checkout_ticket_transaction(uuid, uuid, jsonb, text, numeric, uuid) to authenticated;

-- void_ticket_transaction RPC ----------------------------------------------
-- Pola sama persis dengan void_transaction (verifikasi PIN manajer via
-- crypt). Tidak ada stok yang dikembalikan — serial tetap dialokasikan
-- permanen (tiket fisik sudah terlanjur dicetak/diberikan).

create or replace function public.void_ticket_transaction(
  p_business_id uuid,
  p_transaction_id uuid,
  p_manager_pin text,
  p_reason text default null
)
returns table (voided_by_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager record;
  v_tx record;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select c.id, c.name
  into v_manager
  from public.cashiers c
  where c.business_id = p_business_id
    and c.role = 'manajer'
    and c.active
    and c.pin_hash = extensions.crypt(p_manager_pin, c.pin_hash)
  limit 1;

  if not found then
    raise exception 'PIN salah atau tidak memiliki otorisasi';
  end if;

  select t.id, t.voided
  into v_tx
  from public.ticket_transactions t
  where t.id = p_transaction_id
    and t.business_id = p_business_id
  for update;

  if not found then
    raise exception 'transaction not found';
  end if;

  if v_tx.voided then
    raise exception 'transaksi sudah dibatalkan';
  end if;

  update public.ticket_transactions
  set voided = true,
      voided_at = now(),
      void_reason = nullif(left(trim(p_reason), 200), ''),
      voided_by = v_manager.id
  where id = p_transaction_id;

  return query select v_manager.name;
end;
$$;

grant execute on function public.void_ticket_transaction(uuid, uuid, text, text) to authenticated;
