-- Module: cashier management completeness — reset PIN (via RPC, since
-- pin_hash must never be set directly from the client) and a toggle for
-- active/inactive that was already read by the UI but never writable.

create or replace function public.reset_cashier_pin(
  p_business_id uuid,
  p_cashier_id uuid,
  p_new_pin text
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

  if p_new_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN harus 4-6 digit angka';
  end if;

  update public.cashiers
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf'))
  where id = p_cashier_id and business_id = p_business_id;

  if not found then
    raise exception 'cashier not found';
  end if;
end;
$$;

grant execute on function public.reset_cashier_pin(uuid, uuid, text) to authenticated;
