-- Extensions
create extension if not exists pgcrypto with schema extensions;

-- Private schema for internal helpers (not exposed via PostgREST).
create schema if not exists private;

-- Reusable trigger to keep `updated_at` current on row changes.
-- (The `private.owns_business()` RLS helper lives in the next migration,
-- since it needs to reference the `businesses` table which doesn't exist yet.)
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
