-- deleteOpenBill (tombol "Hapus" di daftar Open Bill POS) sebelumnya cuma
-- dibatasi di UI ("kasir/manajer" menyembunyikan tombol untuk pelayan, lihat
-- commit 20e7624) -- server action-nya sendiri tidak pernah memverifikasi
-- role/sesi sama sekali, jadi bon tersimpan siapa pun bisa dihapus oleh
-- siapa pun yang punya sesi kasir aktif (termasuk lewat pemanggilan
-- langsung, melewati tombol UI).
--
-- Perbaikan: hapus bon yang SUDAH TERSIMPAN (aksi manual, tombol "Hapus")
-- kini lewat RPC yang mewajibkan PIN manajer aktif -- pola sama persis
-- dengan void_pos_transaction/void_ticket_transaction. Pembersihan bon
-- otomatis setelah pembayaran BERHASIL (checkout_transaction sudah selesai)
-- bukan bagian dari perbaikan ini -- itu bukan "hapus" oleh staf, melainkan
-- housekeeping sistem menyusul transaksi yang sudah tercatat lewat RPC
-- checkout yang sah.

create or replace function public.delete_open_bill(
  p_business_id  uuid,
  p_bill_id      uuid,
  p_manager_pin  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1
    from public.cashiers c
    where c.business_id = p_business_id
      and c.role = 'manajer'
      and c.active
      and c.pin_hash = extensions.crypt(p_manager_pin, c.pin_hash)
  ) then
    raise exception 'PIN salah atau tidak memiliki otorisasi';
  end if;

  delete from public.open_bills
  where id = p_bill_id
    and business_id = p_business_id;
end;
$$;

grant execute on function public.delete_open_bill(uuid, uuid, text) to authenticated;
