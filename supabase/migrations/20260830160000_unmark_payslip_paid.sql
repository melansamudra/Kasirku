-- Sebelumnya "Tandai Sudah Dibayar" tidak bisa dibatalkan sama sekali --
-- slip terkunci permanen begitu diklik, padahal itu gampang kepencet gak
-- sengaja. reverse_journal_entry yang sudah ada cuma buat jurnal 'manual',
-- payroll punya alur sendiri (post_journal_entry_id + expense_id disimpan
-- di payslips), jadi butuh RPC pembalik sendiri juga.
alter table public.payslips
  add column journal_entry_id uuid references public.journal_entries (id) on delete set null,
  add column expense_id uuid references public.expenses (id) on delete set null;

create or replace function public.unmark_payslip_paid(
  p_business_id uuid,
  p_payslip_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payslip record;
  v_lines jsonb;
  v_original_description text;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select id, paid_at, journal_entry_id, expense_id
  into v_payslip
  from public.payslips
  where id = p_payslip_id and business_id = p_business_id;

  if not found then
    raise exception 'slip gaji tidak ditemukan';
  end if;

  if v_payslip.paid_at is null then
    raise exception 'slip ini belum ditandai dibayar';
  end if;

  if v_payslip.journal_entry_id is not null then
    select description into v_original_description
    from public.journal_entries
    where id = v_payslip.journal_entry_id;

    select jsonb_agg(jsonb_build_object(
      'account_code', a.code,
      'debit', jl.credit,
      'credit', jl.debit
    ))
    into v_lines
    from public.journal_lines jl
    join public.accounts a on a.id = jl.account_id
    where jl.entry_id = v_payslip.journal_entry_id;

    if v_lines is not null then
      perform private.post_journal(
        p_business_id, now(),
        'Batalkan pembayaran: ' || coalesce(v_original_description, 'Gaji'),
        'koreksi', v_payslip.journal_entry_id, v_lines
      );
    end if;
  end if;

  if v_payslip.expense_id is not null then
    delete from public.expenses where id = v_payslip.expense_id and business_id = p_business_id;
  end if;

  update public.payslips
  set paid_at = null, journal_entry_id = null, expense_id = null
  where id = p_payslip_id;
end;
$$;

grant execute on function public.unmark_payslip_paid(uuid, uuid) to authenticated;
