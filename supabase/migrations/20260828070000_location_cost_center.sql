-- Dapur Produksi (dan lokasi lain kalau perlu nanti) mau diperlakukan
-- sebagai cost center mandiri: staf & biaya operasional (listrik/gas/dll)
-- yang bisa ditelusuri ke 1 lokasi tertentu -- sama pola dengan
-- `location_id` yang sudah dipakai di stock_adjustments/purchase_requests/
-- purchases. Nullable & default null supaya karyawan/pengeluaran lama
-- (business-wide) tidak berubah perilakunya.
alter table public.employees
  add column location_id uuid references public.stock_locations (id) on delete set null;

alter table public.expenses
  add column location_id uuid references public.stock_locations (id) on delete set null;

create index employees_location_id_idx on public.employees (location_id);
create index expenses_location_id_idx on public.expenses (location_id);
