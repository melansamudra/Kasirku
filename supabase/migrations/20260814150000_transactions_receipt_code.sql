-- Tambah kolom receipt_code: kode acak per transaksi (mis. "6MT4QM", gaya nomor
-- struk fisik) sebagai identifier yang aman ditampilkan ke akun mirror.
-- Berbeda dari invoice_number yang berurutan per hari (INV-YYYYMMDD-0001, 0002, ...)
-- sehingga bisa membocorkan volume transaksi harian toko ke pemegang akun mirror,
-- receipt_code diacak sehingga tidak bisa ditebak/diurutkan.
--
-- Dibuat lewat trigger BEFORE INSERT (bukan mengubah tiap RPC checkout/manual/
-- ticket/historical yang insert ke transactions) supaya berlaku otomatis untuk
-- semua jalur insert tanpa menyentuh fungsi checkout yang sudah beberapa kali
-- ditambal.

alter table public.transactions
add column if not exists receipt_code text;

create or replace function public.generate_receipt_code()
returns text
language plpgsql
as $$
declare
  -- Tanpa 0/O dan 1/I supaya tidak rancu saat dibaca manual.
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, (floor(random() * length(chars)) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.set_transaction_receipt_code()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_code is null then
    new.receipt_code := public.generate_receipt_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transactions_receipt_code on public.transactions;
create trigger trg_transactions_receipt_code
before insert on public.transactions
for each row execute function public.set_transaction_receipt_code();

-- Backfill transaksi yang sudah ada.
update public.transactions
set receipt_code = public.generate_receipt_code()
where receipt_code is null;
