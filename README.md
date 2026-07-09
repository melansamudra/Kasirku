# KasirKu

POS kasir untuk F&B dan Retail. Next.js (App Router, TypeScript, Tailwind) + Supabase (Postgres, Auth, Storage).

Migrasi dari prototype single-file HTML/localStorage — lihat referensi lengkap logika bisnis & rencana skema di [`docs/reference/`](docs/reference/).

## Struktur project

```
src/
  app/                  routes (App Router)
  lib/
    supabase/
      client.ts          Supabase client untuk Client Components (browser)
      server.ts           Supabase client untuk Server Components/Actions (cookies)
      middleware.ts        refresh session token, dipanggil dari src/proxy.ts
    types/
      database.ts          tipe hasil `supabase gen types typescript` (masih placeholder)
supabase/
  config.toml             konfigurasi Supabase CLI lokal
  migrations/              schema database, urut sesuai modul (lihat di bawah)
docs/
  reference/
    pos-system_1.html       prototype asli (referensi logika bisnis, JANGAN dijalankan sebagai app)
    skema-database-kasirku.md   dokumen perencanaan skema
```

## Setup

1. Install dependencies (sudah dijalankan saat scaffold, ulangi kalau clone baru):
   ```bash
   npm install
   ```
2. Buat project di [supabase.com](https://supabase.com/dashboard), lalu salin `.env.example` ke `.env.local` dan isi `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` dari Project Settings → API.
3. Link project lokal ke project Supabase yang baru dibuat:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
4. Jalankan migration ke database Supabase:
   ```bash
   npx supabase db push
   ```
   Atau, untuk development lokal dengan Docker (`supabase start` butuh Docker Desktop):
   ```bash
   npx supabase start
   npx supabase db reset   # apply semua migration ke instance lokal
   ```
5. Generate TypeScript types dari schema yang sudah jalan (menggantikan placeholder di `src/lib/types/database.ts`):
   ```bash
   npx supabase gen types typescript --project-id <project-ref> > src/lib/types/database.ts
   ```
6. Jalankan dev server:
   ```bash
   npm run dev
   ```

## Urutan migration

Mengikuti urutan modul di `docs/reference/skema-database-kasirku.md`:

1. `20260702100000_extensions_and_helpers.sql` — extension pgcrypto, skema `private`, helper RLS `private.owns_business()`
2. `20260702100100_businesses_and_cashiers.sql` — fondasi auth & akses
3. `20260702100200_products_ingredients_recipes.sql` — data master
4. `20260702100300_shifts_and_transactions.sql` — inti operasional
5. `20260702100400_finance_tables.sql` — modul Keuangan
6. `20260702100500_fnb_support_tables.sql` — fitur pendukung F&B (juga menyambungkan FK `transactions.table_id` yang sengaja ditunda dari migration #4, karena tabel `tables` baru ada di sini)
7. `20260702100600_activity_log.sql` — log aktivitas

Setiap tabel dengan `business_id` diamankan dengan RLS lewat `private.owns_business(business_id)` — akses hanya untuk businesses milik `auth.uid()` yang sedang login. Tabel anak yang tidak punya `business_id` langsung (`product_recipes`, `transaction_items`, dll) diamankan lewat `EXISTS` join ke tabel induknya.

Operasi yang butuh privilege di luar RLS pemilik bisnis (verifikasi PIN kasir, self-order pelanggan lewat scan QR, tutup shift) jalan lewat Postgres function `security definer`: `verify_cashier_pin`, `get_self_order_menu`/`submit_self_order`, dan `close_shift` — lihat masing-masing migration di `supabase/migrations/`.
