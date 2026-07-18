-- Manual journal entries can never be edited or deleted once posted (by
-- design — journal_entries only grants a SELECT policy, see accounting_core
-- migration), which is correct bookkeeping practice but left users with no
-- way to fix a mistake. The UI already told them to "use a reversing entry"
-- but no feature actually did that. This adds one: reverse_journal_entry()
-- posts a new entry with every line's debit/credit swapped from the
-- original, dated today (not backdated), so the mistake stays visible in
-- history instead of being silently edited away.
alter table public.journal_entries drop constraint if exists journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'penjualan', 'void', 'pembelian', 'beban', 'payroll', 'tutup_buku', 'koreksi'));

create or replace function public.reverse_journal_entry(
  p_business_id uuid,
  p_entry_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_lines jsonb;
  v_new_entry_id uuid;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select id, source, description
  into v_entry
  from public.journal_entries
  where id = p_entry_id and business_id = p_business_id;

  if not found then
    raise exception 'jurnal tidak ditemukan';
  end if;

  -- Hanya jurnal manual yang bisa dikoreksi lewat fitur ini — entri otomatis
  -- (penjualan/void/dll) punya alur pembalikannya sendiri (mis. void_transaction).
  if v_entry.source <> 'manual' then
    raise exception 'hanya jurnal manual yang bisa dikoreksi';
  end if;

  if exists (
    select 1 from public.journal_entries
    where source = 'koreksi' and source_id = p_entry_id
  ) then
    raise exception 'jurnal ini sudah pernah dikoreksi';
  end if;

  select jsonb_agg(jsonb_build_object(
    'account_code', a.code,
    'debit', jl.credit,
    'credit', jl.debit
  ))
  into v_lines
  from public.journal_lines jl
  join public.accounts a on a.id = jl.account_id
  where jl.entry_id = p_entry_id;

  v_new_entry_id := private.post_journal(
    p_business_id,
    now(),
    'Koreksi: ' || v_entry.description || coalesce(nullif(' — ' || trim(p_note), ' — '), ''),
    'koreksi',
    p_entry_id,
    v_lines
  );

  return v_new_entry_id;
end;
$$;

grant execute on function public.reverse_journal_entry(uuid, uuid, text) to authenticated;
