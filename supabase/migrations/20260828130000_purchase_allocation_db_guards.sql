-- Audit IT/Purchasing (2026-08-28) nemu 2 celah: gerbang budget
-- (procurement_budget_gate_enabled) dan batas qty alokasi cuma dicek di
-- server action (addItemAllocation/forwardAllocationsToSupplier), TIDAK ada
-- constraint/trigger di DB. Artinya panggilan RPC/API langsung (bypass UI)
-- bisa: (1) alokasikan barang yang belum APPROVED IN BUDGET walau gerbang
-- ON, (2) alokasikan qty lebih dari yang diminta/disetujui, dobel-hitung
-- kalau dipecah ke beberapa supplier. Trigger ini menutup keduanya di level
-- DB, jadi bukan cuma penegakan UI yang bisa dilewati.
create or replace function private.enforce_purchase_allocation_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_business record;
  v_cap numeric(12, 2);
  v_already_allocated numeric(12, 2);
begin
  select id, business_id, item_name, qty_ordered, approved_qty, budget_status
  into v_item
  from public.purchase_request_items
  where id = new.purchase_request_item_id;

  if not found then
    raise exception 'Barang permintaan (purchase_request_item %) tidak ditemukan.', new.purchase_request_item_id;
  end if;

  select cost_control_enabled, procurement_budget_gate_enabled
  into v_business
  from public.businesses
  where id = v_item.business_id;

  if coalesce(v_business.cost_control_enabled, false)
    and coalesce(v_business.procurement_budget_gate_enabled, false)
    and v_item.budget_status is distinct from 'approved_in_budget'
  then
    raise exception 'Item "%" belum disetujui Cost Control (APPROVED IN BUDGET). Setujui dulu sebelum alokasi ke supplier.',
      v_item.item_name;
  end if;

  v_cap := coalesce(v_item.approved_qty, v_item.qty_ordered);

  select coalesce(sum(qty), 0)
  into v_already_allocated
  from public.purchase_request_item_allocations
  where purchase_request_item_id = new.purchase_request_item_id
    and id <> new.id;

  if v_already_allocated + new.qty > v_cap + 0.01 then
    raise exception 'Alokasi "%" (% + % = %) melebihi qty disetujui (%).',
      v_item.item_name, v_already_allocated, new.qty, v_already_allocated + new.qty, v_cap;
  end if;

  return new;
end;
$$;

create trigger enforce_purchase_allocation_limits_trigger
before insert or update of qty, purchase_request_item_id on public.purchase_request_item_allocations
for each row execute function private.enforce_purchase_allocation_limits();
