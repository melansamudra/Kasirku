-- Fitur baru (beda total dari Mirror Accounts / mirror_visible_transactions
-- yang cuma akses baca laporan): saat toggle "Kirim ke Toko Lain" dinyalakan
-- pada sebuah transaksi, transaksi itu direplikasi jadi TRANSAKSI PENUH di
-- business_id lain -- ikut memotong stok & membuat jurnal sendiri di sana,
-- seolah-olah toko tujuan itu juga benar-benar menjualnya.
--
-- Skenario v1 (dikonfirmasi user 2026-09-07): toko sumber & tujuan berada di
-- bawah 1 owner Kasirku yang sama -- persis pola yang sudah ada & teruji di
-- ship_inter_unit_transfer (20260907130000_inter_unit_transfers.sql). TIDAK
-- didesain untuk franchisee dengan akun terpisah (butuh alur undang/approve
-- yang jauh lebih kompleks -- fase 2 kalau dibutuhkan).
--
-- Ini aman karena checkout_transaction() sendiri mensyaratkan
-- private.owns_business(p_business_id) di baris pertamanya (cek jalan
-- terhadap auth.uid() sesi aktif) -- jadi RPC baru ini cuma bisa berhasil
-- memanggil checkout_transaction() untuk business_id tujuan kalau owner yang
-- sama juga memiliki bisnis itu.

create table public.transaction_mirror_links (
  id uuid primary key default gen_random_uuid(),
  from_business_id uuid not null references public.businesses (id) on delete cascade,
  to_business_id uuid not null references public.businesses (id) on delete cascade,
  to_cashier_id uuid not null references public.cashiers (id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Satu bisnis sumber cuma boleh punya 1 target mirror aktif di v1.
create unique index transaction_mirror_links_from_business_id_key
  on public.transaction_mirror_links (from_business_id) where active;
create index transaction_mirror_links_to_business_id_idx
  on public.transaction_mirror_links (to_business_id);

alter table public.transaction_mirror_links enable row level security;

create policy "Owner of either business manages mirror links"
on public.transaction_mirror_links for all
using (private.owns_business(from_business_id) or private.owns_business(to_business_id))
with check (private.owns_business(from_business_id) or private.owns_business(to_business_id));

create table public.transaction_mirror_product_map (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.transaction_mirror_links (id) on delete cascade,
  from_product_id uuid not null references public.products (id) on delete cascade,
  to_product_id uuid not null references public.products (id) on delete cascade,
  unique (link_id, from_product_id)
);

create index transaction_mirror_product_map_link_id_idx
  on public.transaction_mirror_product_map (link_id);

alter table public.transaction_mirror_product_map enable row level security;

create policy "Owner of either business manages mirror product map"
on public.transaction_mirror_product_map for all
using (
  exists (
    select 1 from public.transaction_mirror_links l
    where l.id = link_id
      and (private.owns_business(l.from_business_id) or private.owns_business(l.to_business_id))
  )
)
with check (
  exists (
    select 1 from public.transaction_mirror_links l
    where l.id = link_id
      and (private.owns_business(l.from_business_id) or private.owns_business(l.to_business_id))
  )
);

-- Traceability + guard anti-dobel-kirim (client_ref juga sudah menjamin ini
-- di sisi checkout_transaction, tapi tabel ini yang dipakai UI untuk
-- menampilkan status "sudah dikirim" dan jadi dasar cascade void) + dasar
-- cascade void.
create table public.mirrored_transactions (
  id uuid primary key default gen_random_uuid(),
  source_transaction_id uuid not null unique references public.transactions (id) on delete cascade,
  source_business_id uuid not null references public.businesses (id) on delete cascade,
  dest_transaction_id uuid not null references public.transactions (id) on delete cascade,
  dest_business_id uuid not null references public.businesses (id) on delete cascade,
  link_id uuid not null references public.transaction_mirror_links (id),
  created_at timestamptz not null default now()
);

create index mirrored_transactions_dest_transaction_id_idx
  on public.mirrored_transactions (dest_transaction_id);

alter table public.mirrored_transactions enable row level security;

create policy "Owner of either business reads mirrored transactions"
on public.mirrored_transactions for select
using (private.owns_business(source_business_id) or private.owns_business(dest_business_id));

-- RPC utama -----------------------------------------------------------------

create or replace function public.mirror_transaction_to_linked_store(
  p_business_id    uuid,
  p_transaction_id uuid
)
returns table (dest_transaction_id uuid, dest_invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx           record;
  v_existing     record;
  v_link         record;
  v_item         record;
  v_items        jsonb := '[]'::jsonb;
  v_payments     jsonb;
  v_to_product_id uuid;
  v_missing      text := '';
  v_result       record;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select t.id, t.voided, t.invoice_number
  into v_tx
  from public.transactions t
  where t.id = p_transaction_id and t.business_id = p_business_id
  for update;

  if not found then
    raise exception 'transaction not found';
  end if;

  if v_tx.voided then
    raise exception 'transaksi sudah dibatalkan, tidak bisa dikirim ke toko lain';
  end if;

  -- Idempotent: kalau sudah pernah dikirim, kembalikan hasil yang sudah ada
  -- apa adanya (aman diklik ulang / re-render UI), jangan kirim dobel.
  select m.dest_transaction_id, t.invoice_number as dest_invoice_number
  into v_existing
  from public.mirrored_transactions m
  join public.transactions t on t.id = m.dest_transaction_id
  where m.source_transaction_id = p_transaction_id;

  if found then
    return query select v_existing.dest_transaction_id, v_existing.dest_invoice_number;
    return;
  end if;

  select l.id, l.to_business_id, l.to_cashier_id
  into v_link
  from public.transaction_mirror_links l
  where l.from_business_id = p_business_id and l.active
  limit 1;

  if not found then
    raise exception 'toko ini belum diatur untuk mirror ke toko lain';
  end if;

  -- Pertahanan berlapis (sama seperti ship_inter_unit_transfer): meski RLS
  -- transaction_mirror_links sudah mengizinkan insert asal salah satu sisi
  -- dimiliki caller, kirim transaksi beneran cuma boleh antar bisnis dengan
  -- owner yang SAMA -- checkout_transaction() sendiri akan menolak lewat
  -- owns_business(dest) kalau ini dilanggar, tapi cek eksplisit di sini
  -- kasih pesan yang jelas lebih awal.
  if (select owner_id from public.businesses where id = p_business_id)
     <> (select owner_id from public.businesses where id = v_link.to_business_id) then
    raise exception 'toko sumber dan tujuan harus dimiliki owner yang sama';
  end if;

  for v_item in
    select ti.product_id, ti.name, ti.qty, ti.disc, ti.disc_type, ti.note, ti.batch
    from public.transaction_items ti
    where ti.transaction_id = p_transaction_id
      and coalesce(ti.voided, false) = false
  loop
    v_to_product_id := null;
    if v_item.product_id is not null then
      select to_product_id into v_to_product_id
      from public.transaction_mirror_product_map
      where link_id = v_link.id and from_product_id = v_item.product_id;
    end if;

    if v_to_product_id is null then
      v_missing := v_missing || case when v_missing = '' then '' else ', ' end || v_item.name;
      continue;
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_to_product_id,
      'qty', v_item.qty,
      'disc', coalesce(v_item.disc, 0),
      'disc_type', coalesce(v_item.disc_type, 'pct'),
      'note', v_item.note,
      'batch', coalesce(v_item.batch, 0)
    ));
  end loop;

  if v_missing <> '' then
    raise exception 'produk belum dipetakan ke toko tujuan: %', v_missing;
  end if;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'tidak ada item aktif untuk dikirim';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'method', tp.method, 'amount', tp.amount, 'received', tp.received
  )), '[]'::jsonb)
  into v_payments
  from public.transaction_payments tp
  where tp.transaction_id = p_transaction_id;

  -- Reuse langsung checkout_transaction() yang sudah ada -- jangan tulis
  -- ulang logic potong stok/jurnal. client_ref = id transaksi sumber bikin
  -- ini idempotent juga di sisi checkout (dicek per business_id).
  select * into v_result
  from public.checkout_transaction(
    p_business_id => v_link.to_business_id,
    p_cashier_id  => v_link.to_cashier_id,
    p_items       => v_items,
    p_payments    => v_payments,
    p_client_ref  => p_transaction_id,
    p_order_type  => 'mirror'
  );

  insert into public.mirrored_transactions (
    source_transaction_id, source_business_id, dest_transaction_id, dest_business_id, link_id
  ) values (
    p_transaction_id, p_business_id, v_result.transaction_id, v_link.to_business_id, v_link.id
  );

  return query select v_result.transaction_id, v_result.invoice_number;
end;
$$;

grant execute on function public.mirror_transaction_to_linked_store(uuid, uuid) to authenticated;

-- Cascade void ----------------------------------------------------------
-- Redefinisi 3 fungsi void yang sudah ada, salin definisi TERBARU dan
-- tambah langkah mirror di posisi yang aman.

-- void_transaction_item: blokir void per-item untuk transaksi yang sudah
-- dikirim ke toko lain -- reversal parsial lintas toko terlalu rumit untuk
-- v1, harus void seluruh transaksi sekaligus (yang otomatis cascade).
create or replace function public.void_transaction_item(
  p_business_id    uuid,
  p_transaction_id uuid,
  p_item_id        uuid,
  p_reason         text    default null,
  p_cashier_id     uuid    default null,
  p_manager_pin    text    default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx                   record;
  v_item                 record;
  v_is_owner              boolean;
  v_manager               record;
  v_item_gross           numeric(12,2);
  v_item_disc_amt        numeric(12,2);
  v_item_net             numeric(12,2);
  v_base_after_item_disc numeric(12,2);
  v_order_disc_portion   numeric(12,2);
  v_item_subtotal        numeric(12,2);
  v_service_portion      numeric(12,2);
  v_tax_portion          numeric(12,2);
  v_item_total           numeric(12,2);
  v_item_cost            numeric(12,2);
  v_journal_lines        jsonb;
  v_payment_ratio        numeric;
  v_payment              record;
  v_payment_reduce       numeric(12,2);
  v_cash_reduction       numeric(12,2) := 0;
  v_noncash_reduction    numeric(12,2) := 0;
  v_shift_closed         boolean;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select (b.owner_id = auth.uid()) into v_is_owner
  from public.businesses b
  where b.id = p_business_id;

  if not coalesce(v_is_owner, false) then
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
  end if;

  select ti.id, ti.voided, ti.price, ti.qty, ti.cost,
         ti.disc, ti.disc_type, ti.product_id
  into v_item
  from public.transaction_items ti
  where ti.id = p_item_id
    and ti.transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'item tidak ditemukan';
  end if;
  if v_item.voided then
    raise exception 'item sudah di-void';
  end if;

  select t.id, t.voided, t.subtotal_raw, t.total_item_disc, t.order_disc_amt,
         t.subtotal, t.service, t.tax, t.total, t.total_cost, t.gross_profit,
         t.invoice_number, t.shift_id, t.date
  into v_tx
  from public.transactions t
  where t.id = p_transaction_id
    and t.business_id = p_business_id
  for update;

  if not found then
    raise exception 'transaksi tidak ditemukan';
  end if;
  if v_tx.voided then
    raise exception 'transaksi sudah dibatalkan sepenuhnya';
  end if;

  if exists (
    select 1 from public.mirrored_transactions where source_transaction_id = p_transaction_id
  ) then
    raise exception 'Transaksi ini sudah dikirim ke toko lain — void seluruh transaksi, bukan per-item.';
  end if;

  perform private.assert_mirror_month_unlocked(p_business_id, v_tx.date);

  v_item_gross    := v_item.price * v_item.qty;
  v_item_disc_amt := case v_item.disc_type
    when 'pct' then round(v_item_gross * v_item.disc / 100)
    else least(v_item.disc * v_item.qty, v_item_gross)
  end;
  v_item_net := v_item_gross - v_item_disc_amt;

  v_base_after_item_disc := v_tx.subtotal_raw - v_tx.total_item_disc;
  v_order_disc_portion := case
    when v_base_after_item_disc > 0
    then round(v_tx.order_disc_amt * v_item_net / v_base_after_item_disc)
    else 0
  end;

  v_item_subtotal := v_item_net - v_order_disc_portion;

  v_service_portion := case
    when v_tx.subtotal > 0
    then round(v_tx.service * v_item_subtotal / v_tx.subtotal)
    else 0
  end;

  v_tax_portion := case
    when (v_tx.subtotal + v_tx.service) > 0
    then round(v_tx.tax * (v_item_subtotal + v_service_portion)
               / (v_tx.subtotal + v_tx.service))
    else 0
  end;

  v_item_total := v_item_subtotal + v_service_portion + v_tax_portion;
  v_item_cost  := v_item.cost * v_item.qty;

  update public.transaction_items
  set voided      = true,
      void_reason = nullif(left(trim(p_reason), 200), ''),
      voided_at   = now(),
      voided_by   = p_cashier_id
  where id = p_item_id;

  update public.transactions
  set subtotal_raw    = subtotal_raw    - v_item_gross,
      total_item_disc = total_item_disc - v_item_disc_amt,
      order_disc_amt  = order_disc_amt  - v_order_disc_portion,
      subtotal        = subtotal        - v_item_subtotal,
      service         = service         - v_service_portion,
      tax             = tax             - v_tax_portion,
      total           = total           - v_item_total,
      total_cost      = total_cost      - v_item_cost,
      gross_profit    = gross_profit    - (v_item_subtotal - v_item_cost)
  where id = p_transaction_id;

  v_payment_ratio := case when v_tx.total > 0 then v_item_total / v_tx.total else 0 end;
  if v_payment_ratio > 0 then
    for v_payment in
      select id, method, amount
      from public.transaction_payments
      where transaction_id = p_transaction_id
      for update
    loop
      v_payment_reduce := least(v_payment.amount, round(v_payment.amount * v_payment_ratio, 2));
      update public.transaction_payments
      set amount = amount - v_payment_reduce
      where id = v_payment.id;
      if v_payment.method = 'Tunai' then
        v_cash_reduction := v_cash_reduction + v_payment_reduce;
      else
        v_noncash_reduction := v_noncash_reduction + v_payment_reduce;
      end if;
    end loop;
  end if;

  if v_tx.shift_id is not null then
    select closed_at is not null into v_shift_closed
    from public.shifts where id = v_tx.shift_id;

    update public.shifts
    set total_sales    = total_sales - v_item_total,
        cash_sales     = case when v_shift_closed then cash_sales - v_cash_reduction else cash_sales end,
        non_cash_sales = case when v_shift_closed then non_cash_sales - v_noncash_reduction else non_cash_sales end,
        expected_cash  = case when v_shift_closed then expected_cash - v_cash_reduction else expected_cash end,
        difference     = case when v_shift_closed then difference + v_cash_reduction else difference end
    where id = v_tx.shift_id;
  end if;

  update public.products
  set stock = stock + v_item.qty
  where id = v_item.product_id
    and deleted_at is null;

  update public.ingredients i
  set stock = i.stock + pr.qty * v_item.qty
  from public.product_recipes pr
  where pr.product_id = v_item.product_id
    and pr.ingredient_id = i.id;

  v_journal_lines := '[]'::jsonb;
  if v_item_total > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '4-001', 'debit', v_item_subtotal + v_service_portion, 'credit', 0),
      jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', v_item_total)
    );
    if v_tax_portion > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2-200', 'debit', v_tax_portion, 'credit', 0)
      );
    end if;
  end if;
  if v_item_cost > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1-200', 'debit', v_item_cost, 'credit', 0),
      jsonb_build_object('account_code', '5-001', 'debit', 0, 'credit', v_item_cost)
    );
  end if;

  if jsonb_array_length(v_journal_lines) >= 2 then
    perform private.post_journal(
      p_business_id,
      now(),
      'Void item ' || v_tx.invoice_number,
      'void',
      p_transaction_id,
      v_journal_lines
    );
  end if;
end;
$$;

grant execute on function public.void_transaction_item(uuid, uuid, uuid, text, uuid, text) to authenticated;

-- void_transaction (manager PIN) & owner_void_transaction: setelah reversal
-- stok+jurnal sumber selesai, cascade-void transaksi mirror-nya (kalau ada).
-- Tidak perlu guard anti-rekursi: source_transaction_id cuma pernah diisi
-- dengan id transaksi ASLI, jadi lookup yang sama pada transaksi TUJUAN saat
-- di-void tidak akan menemukan apa-apa -- rantai berhenti sendiri.
create or replace function public.void_transaction(
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
  v_journal_lines jsonb;
  v_mirrored record;
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

  select t.id, t.voided, t.date, t.total, t.subtotal, t.service, t.tax, t.total_cost, t.invoice_number
  into v_tx
  from public.transactions t
  where t.id = p_transaction_id
    and t.business_id = p_business_id
  for update;

  if not found then
    raise exception 'transaction not found';
  end if;

  if v_tx.voided then
    raise exception 'transaksi sudah dibatalkan';
  end if;

  perform private.assert_mirror_month_unlocked(p_business_id, v_tx.date);

  update public.products p
  set stock = p.stock + ti.qty
  from public.transaction_items ti
  where ti.transaction_id = p_transaction_id
    and ti.voided = false
    and ti.product_id = p.id
    and p.deleted_at is null;

  update public.ingredients i
  set stock = i.stock + sub.total_qty
  from (
    select pr.ingredient_id, sum(pr.qty * ti.qty) as total_qty
    from public.transaction_items ti
    join public.product_recipes pr on pr.product_id = ti.product_id
    where ti.transaction_id = p_transaction_id
      and ti.voided = false
      and pr.ingredient_id is not null
    group by pr.ingredient_id
  ) sub
  where sub.ingredient_id = i.id;

  update public.transactions
  set voided = true,
      voided_at = now(),
      void_reason = nullif(left(trim(p_reason), 200), ''),
      voided_by = v_manager.id
  where id = p_transaction_id;

  v_journal_lines := '[]'::jsonb;
  if v_tx.total > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '4-001', 'debit', v_tx.subtotal + v_tx.service, 'credit', 0),
      jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', v_tx.total)
    );
    if v_tx.tax > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2-200', 'debit', v_tx.tax, 'credit', 0)
      );
    end if;
  end if;
  if v_tx.total_cost > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1-200', 'debit', v_tx.total_cost, 'credit', 0),
      jsonb_build_object('account_code', '5-001', 'debit', 0, 'credit', v_tx.total_cost)
    );
  end if;
  if jsonb_array_length(v_journal_lines) >= 2 then
    perform private.post_journal(
      p_business_id, now(), 'Void ' || v_tx.invoice_number, 'void', p_transaction_id, v_journal_lines
    );
  end if;

  select dest_transaction_id, dest_business_id into v_mirrored
  from public.mirrored_transactions where source_transaction_id = p_transaction_id;

  if v_mirrored.dest_transaction_id is not null then
    perform public.owner_void_transaction(
      v_mirrored.dest_business_id,
      v_mirrored.dest_transaction_id,
      'Cascade dari void transaksi sumber ' || v_tx.invoice_number
    );
  end if;

  return query select v_manager.name;
end;
$$;

grant execute on function public.void_transaction(uuid, uuid, text, text) to authenticated;

create or replace function public.owner_void_transaction(
  p_business_id uuid,
  p_transaction_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx record;
  v_journal_lines jsonb;
  v_mirrored record;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select t.id, t.voided, t.total, t.subtotal, t.service, t.tax, t.total_cost, t.invoice_number, t.date
  into v_tx
  from public.transactions t
  where t.id = p_transaction_id
    and t.business_id = p_business_id
  for update;

  if not found then
    raise exception 'transaction not found';
  end if;

  if v_tx.voided then
    raise exception 'transaksi sudah dibatalkan';
  end if;

  perform private.assert_mirror_month_unlocked(p_business_id, v_tx.date);

  update public.products p
  set stock = p.stock + ti.qty
  from public.transaction_items ti
  where ti.transaction_id = p_transaction_id
    and ti.voided = false
    and ti.product_id = p.id
    and p.deleted_at is null;

  update public.ingredients i
  set stock = i.stock + sub.total_qty
  from (
    select pr.ingredient_id, sum(pr.qty * ti.qty) as total_qty
    from public.transaction_items ti
    join public.product_recipes pr on pr.product_id = ti.product_id
    where ti.transaction_id = p_transaction_id
      and ti.voided = false
      and pr.ingredient_id is not null
    group by pr.ingredient_id
  ) sub
  where sub.ingredient_id = i.id;

  update public.transactions
  set voided = true,
      voided_at = now(),
      void_reason = nullif(left(trim(p_reason), 200), ''),
      voided_by = null
  where id = p_transaction_id;

  v_journal_lines := '[]'::jsonb;
  if v_tx.total > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '4-001', 'debit', v_tx.subtotal + v_tx.service, 'credit', 0),
      jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', v_tx.total)
    );
    if v_tx.tax > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2-200', 'debit', v_tx.tax, 'credit', 0)
      );
    end if;
  end if;
  if v_tx.total_cost > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1-200', 'debit', v_tx.total_cost, 'credit', 0),
      jsonb_build_object('account_code', '5-001', 'debit', 0, 'credit', v_tx.total_cost)
    );
  end if;
  if jsonb_array_length(v_journal_lines) >= 2 then
    perform private.post_journal(
      p_business_id, now(), 'Void ' || v_tx.invoice_number, 'void', p_transaction_id, v_journal_lines
    );
  end if;

  select dest_transaction_id, dest_business_id into v_mirrored
  from public.mirrored_transactions where source_transaction_id = p_transaction_id;

  if v_mirrored.dest_transaction_id is not null then
    perform public.owner_void_transaction(
      v_mirrored.dest_business_id,
      v_mirrored.dest_transaction_id,
      'Cascade dari void transaksi sumber ' || v_tx.invoice_number
    );
  end if;
end;
$$;

grant execute on function public.owner_void_transaction(uuid, uuid, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
