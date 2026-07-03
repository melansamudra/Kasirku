-- Module 12: void transaksi sebagai satu RPC atomik. Hanya manajer (via PIN,
-- diverifikasi terhadap pin_hash di database) yang boleh membatalkan.
-- Stok produk dikembalikan dari transaction_items, dan stok bahan baku
-- dikembalikan dari snapshot transaction_ingredient_consumption — persis
-- kebalikan dari checkout_transaction.

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
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  -- Hanya PIN milik manajer aktif dari bisnis ini yang diterima. Pesan error
  -- sengaja tidak membedakan "PIN salah" vs "bukan manajer".
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

  -- Kembalikan stok produk yang terjual (produk yang sudah dihapus dilewati,
  -- sama seperti aplikasi lama).
  update public.products p
  set stock = p.stock + ti.qty
  from public.transaction_items ti
  where ti.transaction_id = p_transaction_id
    and ti.product_id = p.id
    and p.deleted_at is null;

  -- Kembalikan stok bahan baku yang terkonsumsi resep saat checkout.
  update public.ingredients i
  set stock = i.stock + tic.qty
  from public.transaction_ingredient_consumption tic
  where tic.transaction_id = p_transaction_id
    and tic.ingredient_id = i.id;

  update public.transactions
  set voided = true,
      voided_at = now(),
      void_reason = nullif(left(trim(p_reason), 200), ''),
      voided_by = v_manager.id
  where id = p_transaction_id;

  return query select v_manager.name;
end;
$$;

grant execute on function public.void_transaction(uuid, uuid, text, text) to authenticated;
