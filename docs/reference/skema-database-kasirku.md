# Skema Database — Migrasi KasirKu ke Backend

Dokumen perencanaan untuk migrasi dari localStorage (single HTML file) ke backend dengan database sungguhan. Rekomendasi stack: **Supabase (PostgreSQL)**.

Diagram ringkas relasi inti sudah ditampilkan di chat. Dokumen ini berisi definisi lengkap semua tabel, termasuk yang tidak muat di diagram ringkas.

---

## Prinsip desain

1. **`business_id` di hampir semua tabel** — mengganti mekanisme "tag scope" yang sekarang dilakukan di sisi klien (JavaScript). Di database, F&B dan Retail jadi dua baris di tabel `businesses`, dan setiap tabel turunan (produk, transaksi, dll) terikat lewat foreign key — bukan lagi ditandai manual lewat field `scope`.
2. **Snapshot data di transaksi** — nama produk, harga, cost disalin ke `transaction_items` saat transaksi terjadi (bukan hanya referensi ke `products`), supaya kalau harga produk berubah di kemudian hari, riwayat transaksi lama tetap akurat sesuai harga saat itu. Ini sudah jadi pola yang dipakai di versi localStorage sekarang — dipertahankan.
3. **Soft delete, bukan hard delete** — produk/bahan yang "dihapus" sebaiknya ditandai `deleted_at` (nullable timestamp), bukan benar-benar dihapus dari tabel. Supaya laporan lama yang mereferensikan produk itu tidak rusak.
4. **UUID sebagai primary key** — bukan auto-increment integer. Ini penting kalau nanti butuh sinkronisasi offline-first (device bisa generate ID sendiri tanpa perlu tanya server dulu, tidak akan bentrok antar-device).

---

## Tabel inti

### `businesses`
Representasi 1 baris = 1 "bisnis" (F&B atau Retail dianggap 2 bisnis terpisah, sesuai keputusan yang sudah kita ambil).

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| owner_id | uuid, FK → auth.users | pemilik akun (dari sistem auth Supabase) |
| name | text | nama toko |
| business_type | text | `'fnb'` \| `'retail'` |
| address | text, nullable | |
| phone | text, nullable | |
| npwp | text, nullable | |
| logo_url | text, nullable | link ke Supabase Storage |
| tax_enabled | boolean | default false |
| tax_rate | numeric(5,2) | default 0 |
| service_enabled | boolean | default false |
| service_rate | numeric(5,2) | default 0 |
| auto_lock_enabled | boolean | default true |
| auto_lock_minutes | int | default 5 |
| recovery_code_hash | text, nullable | **di-hash**, bukan plaintext (beda dari versi localStorage) |
| created_at | timestamptz | |

### `cashiers`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK → businesses | |
| name | text | |
| role | text | `'kasir'` \| `'manajer'` |
| pin_hash | text | **di-hash pakai bcrypt/argon2**, bukan plaintext |
| active | boolean | default true — nonaktifkan tanpa hapus histori |
| created_at | timestamptz | |

### `products`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK → businesses | |
| name | text | |
| category | text | |
| price | numeric(12,2) | |
| cost | numeric(12,2) | HPP saat ini |
| stock | numeric(12,2) | |
| barcode | text, nullable | unique per business_id |
| image_url | text, nullable | Supabase Storage, bukan base64 |
| emoji | text, nullable | fallback kalau tidak ada foto |
| deleted_at | timestamptz, nullable | soft delete |
| created_at, updated_at | timestamptz | |

### `ingredients`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK → businesses | |
| name | text | |
| unit | text | gr/ml/pcs |
| unit_cost | numeric(12,2) | rata-rata tertimbang |
| stock | numeric(12,2) | |
| deleted_at | timestamptz, nullable | |

### `product_recipes`
Baris resep per produk (relasi many-to-many produk↔bahan).

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| product_id | uuid, FK → products | |
| ingredient_id | uuid, FK → ingredients, nullable | null kalau bahan manual (tidak terhubung master) |
| ingredient_name_manual | text, nullable | dipakai kalau ingredient_id null |
| qty | numeric(12,4) | qty per 1 unit produk |
| unit | text | |

### `shifts`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK → businesses | |
| cashier_id | uuid, FK → cashiers | |
| opening_cash | numeric(12,2) | |
| opened_at | timestamptz | |
| closed_at | timestamptz, nullable | null = shift masih aktif |
| closing_cash | numeric(12,2), nullable | |
| notes, close_notes | text, nullable | |
| cash_sales, non_cash_sales, total_sales | numeric(12,2) | dihitung saat tutup shift |
| expected_cash | numeric(12,2) | |
| difference | numeric(12,2) | |
| tx_count, void_count | int | |

**Indeks penting:** `(business_id, closed_at)` — untuk query cepat "shift aktif sekarang" (`closed_at IS NULL`).

### `transactions`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK → businesses | |
| shift_id | uuid, FK → shifts, nullable | |
| cashier_id | uuid, FK → cashiers | |
| invoice_number | text | format `INV-20260702-0001`, unique per (business_id, tanggal) |
| date | timestamptz | |
| subtotal_raw, subtotal, service, tax, total | numeric(12,2) | |
| total_item_disc, order_disc_amt | numeric(12,2) | |
| total_cost, gross_profit | numeric(12,2) | HPP teori & laba kotor |
| is_split | boolean | |
| voided | boolean | default false |
| voided_at | timestamptz, nullable | |
| void_reason | text, nullable | |
| voided_by | uuid, FK → cashiers, nullable | manajer yang meng-void |
| table_id | uuid, FK → tables, nullable | untuk self-order F&B |

**Indeks penting:** `(business_id, date)` — hampir semua laporan filter berdasarkan ini.

### `transaction_items`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| transaction_id | uuid, FK → transactions | |
| product_id | uuid, FK → products, nullable | nullable karena produk bisa dihapus, tapi histori tetap harus ada |
| name, category | text | **snapshot** nama/kategori saat transaksi (bukan join ke products) |
| price, cost | numeric(12,2) | **snapshot** harga & HPP saat transaksi |
| qty | numeric(12,2) | |
| note | text, nullable | |

### `transaction_payments`
Mendukung split bill (1 transaksi bisa punya banyak baris pembayaran).

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| transaction_id | uuid, FK → transactions | |
| method | text | Tunai/Kartu/QRIS/dst |
| amount | numeric(12,2) | |
| received, change | numeric(12,2), nullable | khusus tunai |

### `transaction_ingredient_consumption`
Snapshot konsumsi bahan baku per transaksi — dipakai untuk membalik stok kalau transaksi di-void.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| transaction_id | uuid, FK → transactions | |
| ingredient_id | uuid, FK → ingredients | |
| qty | numeric(12,4) | |

---

## Tabel Keuangan

### `expenses`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK → businesses | |
| date | date | |
| category | text | termasuk `'Pembelian Bahan Baku'`, `'Pembelian Barang Dagang'` |
| amount | numeric(12,2) | |
| note | text, nullable | |
| ingredient_id | uuid, FK → ingredients, nullable | terisi kalau kategori = Pembelian Bahan Baku |
| product_id | uuid, FK → products, nullable | terisi kalau kategori = Pembelian Barang Dagang |
| qty | numeric(12,4), nullable | |
| created_at | timestamptz | |

### `inventory_snapshots`
Nilai persediaan harian (bahan baku + produk), dasar hitung Persediaan Awal/Akhir.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK → businesses | |
| date | date | |
| value | numeric(14,2) | |
| manual | boolean | true kalau di-input manual (override "Persediaan Awal Bulan") |

**Constraint:** unique `(business_id, date)`.

### `reconciliations`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK → businesses | |
| date | date | |
| method | text | |
| actual_amount | numeric(12,2) | |
| note | text, nullable | |

### `merchant_fees`
Biaya merchant (MDR) per metode pembayaran.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK → businesses | |
| method | text | |
| fee_percent | numeric(5,2) | |

**Constraint:** unique `(business_id, method)`.

---

## Tabel pendukung

### `custom_payment_methods`
| id (uuid, PK) | business_id (FK) | name (text) |

### `kitchen_printers`
| id (uuid, PK) | business_id (FK) | name | categories (text[]) | connection_type | address |

### `tables` (meja self-order, F&B)
| id (uuid, PK) | business_id (FK) | name | qr_slug (text, unique) |

### `self_orders`
| id (uuid, PK) | business_id (FK) | table_id (FK) | status | created_at |

### `self_order_items`
| id (uuid, PK) | self_order_id (FK) | product_id (FK, nullable) | name, price (snapshot) | qty | note |

### `activity_log`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid, PK | |
| business_id | uuid, FK, nullable | null untuk log sistem lintas-bisnis (kalau ada) |
| type | text | transaksi/produk/sistem/pengaturan |
| status | text | sukses/warning/info |
| title, detail | text | |
| created_at | timestamptz | |

---

## Row Level Security (RLS) — kalau pakai Supabase

Karena data langsung diakses dari frontend (bukan lewat backend API custom), **RLS wajib diaktifkan di semua tabel**, atau siapa saja yang punya API key publik bisa baca/tulis semua data siapa pun.

Pola dasar untuk hampir semua tabel:

```sql
-- Contoh untuk tabel products
alter table products enable row level security;

create policy "Akses hanya untuk bisnis milik sendiri"
on products for all
using (
  business_id in (
    select id from businesses where owner_id = auth.uid()
  )
);
```

Ulangi pola serupa untuk setiap tabel yang punya `business_id`. Untuk `businesses` sendiri, kebijakannya berbasis `owner_id = auth.uid()` langsung.

---

## Pertimbangan arsitektur offline-first

POS harus tetap bisa terima transaksi walau internet toko mati. Ini bukan detail kecil — perlu didesain dari awal:

- **Local-first write**: transaksi baru ditulis dulu ke penyimpanan lokal device (IndexedDB, bukan localStorage — kapasitasnya jauh lebih besar dan mendukung query), lalu disinkronkan ke Supabase di background.
- **Idempotent sync**: karena `id` sudah UUID yang di-generate di device (bukan auto-increment server), transaksi yang gagal terkirim lalu dicoba ulang tidak akan dobel — server tinggal `upsert` berdasarkan `id`.
- **Conflict resolution sederhana**: untuk kasus normal (1 device aktif per shift), konflik jarang terjadi. Kasus yang perlu dipikirkan: dua device dipakai gantian sebelum sempat sync. Strategi paling aman untuk versi awal: **last-write-wins** berdasarkan `updated_at`, dengan catatan ini bukan solusi sempurna — cukup untuk mulai, bukan untuk skala besar.
- **Nomor invoice tetap harus jalan offline** — counter `invoice_number` yang sekarang di localStorage (per hari, per business) perlu direplikasi ke logic client-side juga, supaya nomor invoice tetap bisa di-generate walau offline; sinkronisasi ke server terjadi belakangan.

---

## Urutan migrasi modul (disarankan)

Jangan migrasi semua sekaligus. Urutan yang masuk akal berdasarkan ketergantungan data:

1. `businesses`, `cashiers` — fondasi auth & akses
2. `products`, `ingredients`, `product_recipes` — data master, paling jarang berubah strukturnya
3. `shifts`, `transactions`, `transaction_items`, `transaction_payments` — inti operasional
4. `expenses`, `inventory_snapshots`, `reconciliations`, `merchant_fees` — modul Keuangan
5. `tables`, `self_orders`, `kitchen_printers`, `custom_payment_methods` — fitur pendukung F&B
6. `activity_log` — bisa belakangan, tidak kritikal untuk operasional harian

Di tiap tahap: bangun, uji dengan data dummy, baru migrasikan data asli dari backup JSON yang sudah ada sebelum lanjut ke modul berikutnya.

---

## Yang sengaja belum dibahas di dokumen ini

- Skrip migrasi data dari backup JSON localStorage ke database (perlu dibuat terpisah, setelah skema ini final)
- Desain API/RPC calls spesifik (kalau pakai Supabase, sebagian besar bisa lewat client SDK langsung + RLS, tapi kalkulasi kompleks seperti "tutup shift" mungkin lebih aman sebagai Postgres function/RPC supaya atomic)
- Setup CI/CD dan environment staging vs production

Dokumen ini adalah titik awal perencanaan — detail lebih lanjut sebaiknya dikembangkan di Claude Code, di mana skema ini bisa langsung dieksekusi jadi migration files sungguhan.
