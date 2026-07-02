-- Module 7: cashier PIN handling via RPC, so pin_hash never has to be sent
-- to (or compared on) the client. A 4-6 digit PIN has a tiny keyspace, so
-- even a bcrypt hash of it must never leave the database.

-- Belt-and-suspenders: even if a query forgets to exclude pin_hash, the
-- database itself refuses to return that column to these roles.
revoke select (pin_hash) on public.cashiers from authenticated, anon;

-- Create a cashier with a hashed PIN. Only the owner of the business may
-- call this (checked explicitly, since SECURITY DEFINER bypasses RLS).
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

  if p_role not in ('kasir', 'manajer') then
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

grant execute on function public.create_cashier(uuid, text, text, text) to authenticated;

-- Verify a PIN for a given cashier. Returns the cashier row (without
-- pin_hash) on success, or zero rows on a wrong PIN / inactive cashier /
-- cashier belonging to a business the caller doesn't own.
create or replace function public.verify_cashier_pin(
  p_cashier_id uuid,
  p_pin text
)
returns table (id uuid, business_id uuid, name text, role text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select c.id, c.business_id, c.name, c.role
  from public.cashiers c
  where c.id = p_cashier_id
    and c.active
    and c.pin_hash = extensions.crypt(p_pin, c.pin_hash)
    and private.owns_business(c.business_id);
end;
$$;

grant execute on function public.verify_cashier_pin(uuid, text) to authenticated;
