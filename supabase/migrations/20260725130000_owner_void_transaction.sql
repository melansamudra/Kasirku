-- Lets the owner void a transaction directly from the backoffice — no
-- manager PIN needed, since owns_business() already proves it's the owner's
-- own authenticated session. Mirrors void_transaction's reversal logic
-- exactly (stock/ingredient restore + reversing journal entry) but skips the
-- cashier-manager PIN lookup entirely. void_transaction itself is left
-- untouched — it's not called from anywhere except the backoffice void
-- form, which now uses this instead, but keeping it around costs nothing
-- and preserves a manager-PIN path if it's ever needed again (e.g. from POS).
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
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select t.id, t.voided, t.total, t.subtotal, t.service, t.tax, t.total_cost, t.invoice_number
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

  update public.products p
  set stock = p.stock + ti.qty
  from public.transaction_items ti
  where ti.transaction_id = p_transaction_id
    and ti.product_id = p.id
    and p.deleted_at is null;

  update public.ingredients i
  set stock = i.stock + tic.qty
  from public.transaction_ingredient_consumption tic
  where tic.transaction_id = p_transaction_id
    and tic.ingredient_id = i.id;

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
end;
$$;

grant execute on function public.owner_void_transaction(uuid, uuid, text) to authenticated;
