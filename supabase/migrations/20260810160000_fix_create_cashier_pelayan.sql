-- Izinkan role 'pelayan' di RPC create_cashier.

create or replace function public.create_cashier(
  p_business_id uuid,
  p_name text,
  p_role text,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_role not in ('kasir', 'manajer', 'pelayan') then
    raise exception 'invalid role';
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN harus 4-6 digit angka';
  end if;

  insert into public.cashiers (business_id, name, role, pin_hash)
  values (
    p_business_id,
    p_name,
    p_role,
    extensions.crypt(p_pin, extensions.gen_salt('bf'))
  )
  returning id into new_id;

  return new_id;
end;
$$;
