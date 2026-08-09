# Sistem Finance KasirKu — Dijual Terpisah (Finance Only Plan)

## Context

KasirKu saat ini dijual sebagai satu paket (POS + Akuntansi + SDM). Roadmap item "Sistem Finance dijual terpisah" bertujuan menjangkau segmen baru: bisnis yang **sudah punya sistem kasir sendiri** dan cuma butuh modul Akuntansi/SDM KasirKu. Modul ini sudah ada dan sudah matang (double-entry, jurnal, tutup buku, RLS — lihat memory `mini-erp-scope`) sehingga strategi yang dipilih adalah **repackage**, bukan bangun ulang.

User sudah meninjau referensi desain `AkunPro_v10_1.html` (prototipe lengkap tapi client-side/localStorage tanpa backend) sebagai acuan tampilan + kelengkapan fitur. Sudah diputuskan lewat diskusi sebelumnya:
- Reuse backend Supabase yang ada, bukan bikin app offline baru.
- Lembur & THR tetap manual-nominal (fleksibel) — **tidak** ikut rumus otomatis UU dari referensi.
- Setting komponen gaji (BPJS %, toggle tunjangan) — **ditunda**, di luar scope ini.
- Paketnya berbentuk **plan billing baru** (bukan business_type baru, bukan cuma halaman marketing) supaya bisa dijual ke pembeli yang tidak butuh POS sama sekali.
- Plan baru ditambahkan ke halaman `/billing` yang sudah ada (bukan alur onboarding terpisah).
- Gating v1: sembunyikan dari nav saja dulu, tidak blokir di level route.
- Invoice/Nota: murni alat dokumen dulu, belum posting jurnal otomatis.
- Redesain visual: bertahap per kelompok halaman, bukan sekaligus.

Tujuan akhir sesi ini: dokumen rencana bertahap yang bisa dieksekusi sesi-per-sesi, masing-masing fase bisa di-ship dan diverifikasi sendiri di browser tanpa nunggu fase lain selesai total.

## Temuan Kunci dari Eksplorasi Kode (jangan diulang saat implementasi)

- **`src/lib/billing/plans.ts`**: `PlanCode` cuma string, `plan_code` di tabel `subscriptions` adalah `text` bebas tanpa CHECK constraint — artinya plan baru cukup ditambahkan di array `PLANS`, tidak perlu migrasi skema. Plan hari ini murni konsep harga/tampilan, belum pernah dipakai untuk gating fitur spesifik.
- **Gate akses**: `getSubscriptionAccess()` (`src/lib/billing/status.ts`) dibaca di `src/app/business/[businessId]/(dashboard)/layout.tsx`, redirect keras ke `/billing` kalau `locked`. `/business/[businessId]/pos` ada di LUAR route group `(dashboard)`, tidak pernah dicek subscription — relevan untuk keputusan gating nav-only.
- **Nav gating**: `dashboard-shell.tsx` — `buildNavGroups(businessId, businessType)` adalah fungsi murni yang menyusun array nav pakai ternary/spread berdasar `businessType` (prop, di-fetch sekali di `layout.tsx`). Grup "Akuntansi" dan "SDM" (baris ~80-106, ~135-143) **belum pernah** difilter oleh business_type — ini titik masuk alami untuk gating plan baru. Tombol "Buka Kasir" (baris ~213-222) hardcoded terpisah dari `buildNavGroups`, perlu dikondisikan sendiri.
- **Pola halaman Akuntansi** (`accounting/rekonsiliasi/page.tsx` + `actions.ts`): server `page.tsx` (async, `createClient()`, scoped query `.eq("business_id", ...)`, `notFound()` guard) + `actions.ts` (`"use server"`, re-validasi ownership sebagai defense-in-depth, `.bind(null, businessId)`, `revalidatePath`). Tabel baru: migrasi `create table` + RLS `enable` + satu policy `private.owns_business(business_id)` (helper security-definer yang sudah ada, dipakai berulang).
- **`employees`** (`supabase/migrations/20260711100000_employees.sql`): `id, business_id, name, daily_rate, active, note, cashier_id, created_at`. Belum pernah diubah — nambah `contract_end date` nullable aman, tidak ada konflik.
- **Rekonsiliasi Rekening** (`finance/page.tsx`) SUDAH per-metode-bayar + biaya merchant — **sudah lebih lengkap dari referensi**, tidak perlu kerja fungsional, cuma reskin visual nanti.
- **Period type**: `reports/period.ts` punya `Period = "today"|"week"|"month"|"all"|"custom"` + `getPeriodRange()` (WIB-aware) yang dipakai di banyak halaman. `finance/page.tsx` punya `Period` lokal sendiri yang tidak kompatibel (tanpa `"custom"`) — utang teknis lama, relevan kalau Fase 7 (period switcher global) menyentuh file itu.
- **Pola cetak**: `payroll/[payslipId]/page.tsx` + `print-button.tsx` — kelas `print:hidden` untuk UI kontrol, `print:max-w-none print:mt-0 print:rounded-none print:border-0 print:p-0` untuk kartu dokumen, tombol `window.print()` polos tanpa library PDF. Pola ini dipakai ulang persis untuk Invoice/Nota.
- **Preseden marketing + purchase flow**: `/kalkulator-hpp` (halaman statis) + `/kalkulator-hpp/beli` (beli sekali bayar, guest checkout via `createServiceClient()`, order_id prefix `HPP-`). Tapi Finance Only adalah **subscription berulang** seperti plan yang sudah ada, jadi mekanisme pembayarannya harus ikut pola `billing/actions.ts` (order_id prefix `KK-`, extend `subscriptions.period_end`), bukan pola one-time desktop app. Yang dicontek dari kalkulator-hpp cuma pola "halaman marketing berdiri sendiri di domain yang sama".

---

## Fase 1 — Plan "Finance Only" + Nav Gating

**Tujuan**: Plan baru muncul di `/billing`, dan akun yang pakai plan ini cuma lihat menu Akuntansi/SDM/Kas & Rekening — grup Operasional dan tombol "Buka Kasir" hilang dari sidebar.

**File yang diubah**:
- `src/lib/billing/plans.ts` — tambah `PlanCode` baru (mis. `"finance_monthly" | "finance_yearly"`) + entri `Plan` baru. Tambah field `family: "full" | "finance"` di type `Plan` (lebih bersih daripada sniffing prefix string) + helper `isFinancePlan(code)`.
- `src/app/business/[businessId]/(dashboard)/layout.tsx` — `access.planCode` (sudah di-fetch lewat `getSubscriptionAccess`) dialirkan sebagai prop baru `isFinanceOnly={isFinancePlan(access.planCode)}` ke `DashboardShell`. Tidak perlu query baru.
- `src/app/business/[businessId]/(dashboard)/dashboard-shell.tsx` — prop `isFinanceOnly: boolean`, diteruskan ke `buildNavGroups(businessId, businessType, isFinanceOnly)`; sembunyikan grup "Operasional" dan blok tombol "Buka Kasir" saat `isFinanceOnly` true.
- `src/app/business/[businessId]/billing/page.tsx` — render plan baru dalam grid yang sama dengan plan existing, dikasih badge singkat pembeda ("Kasir + Akuntansi" vs "Akuntansi & SDM saja").

**Migrasi**: tidak ada — `plan_code` sudah kolom bebas tanpa constraint.

**Keputusan yang masih perlu diambil user sebelum/selama fase ini**: nama plan pastinya dan harganya (bisa pakai placeholder dulu, pola "edit sebelum live" seperti plan lain).

**Verifikasi**: set `subscriptions.plan_code` sebuah bisnis test ke plan Finance baru (lewat admin panel/SQL manual), reload dashboard → pastikan grup Operasional & tombol Buka Kasir hilang, Akuntansi/SDM/Rekonsiliasi tetap ada. Pastikan bisnis dengan plan biasa (monthly/yearly/lifetime) tidak terpengaruh.

---

## Fase 2 — Kolom Prasyarat untuk Notifikasi (contract_end, due_date)

**Tujuan**: Siapkan field yang dibutuhkan Fase 6 supaya tidak dibangun di atas kolom kosong.

**Migrasi baru**:
- `supabase/migrations/<ts>_employee_contract_end.sql` — `alter table public.employees add column contract_end date;`
- `supabase/migrations/<ts>_purchase_due_date.sql` — `alter table public.purchases add column due_date date;`

**File yang diubah**: form tambah/edit karyawan (`employees/page.tsx` + `actions.ts`) tambah input "Tanggal Berakhir Kontrak"; form tambah pembelian (`purchases/add-purchase-form.tsx` + `actions.ts`) tambah input "Jatuh Tempo".

**Verifikasi**: isi kedua field baru lewat form, pastikan tersimpan & tampil kembali saat halaman dibuka ulang.

---

## Fase 3 — Halaman Rekap Absensi Bulanan Berdiri Sendiri

**Tujuan**: Pindahkan blok rekap bulanan yang sekarang nempel di `attendance/page.tsx` (baris ~134-159) jadi halaman sendiri yang bisa diakses/dicetak langsung.

**File baru**: `attendance/rekap/page.tsx` — reuse logika agregasi yang sama, tapi dengan selector bulan (bukan tanggal harian).

**File diubah**: `attendance/page.tsx` — ganti blok rekap jadi link "Lihat Rekap Bulanan →" (hindari duplikasi logika); opsional tambah entri nav SDM di `dashboard-shell.tsx`.

**Verifikasi**: buka halaman baru, angka yang tampil harus sama dengan yang dulu tampil di blok lama untuk bulan yang sama; navigasi bulan sebelum/sesudah berfungsi.

---

## Fase 4 — Invoice/Nota

**Tujuan**: Fitur baru murni — nama klien, item baris, DP, jatuh tempo, cetak. Belum posting jurnal otomatis (sesuai keputusan).

**Migrasi baru**: `supabase/migrations/<ts>_invoices.sql`
- `public.invoices`: `id, business_id, customer_id (nullable), invoice_number, date, due_date, dp_amount, status (draft/unpaid/partial/paid), note, created_at`
- `public.invoice_lines`: `id, invoice_id fk cascade, description, qty, unit_price`
- RLS: `invoices` pakai policy `owns_business` standar; `invoice_lines` di-scope lewat exists-check ke `invoices.business_id` (contek pola `journal_lines` terhadap `journal_entries`).

**File baru**:
- `invoices/page.tsx` (list), `invoices/actions.ts` (create/update/mark-paid, `"use server"`)
- `invoices/baru/page.tsx` (form full-page, bukan modal — karena item baris perlu tambah/hapus baris dinamis)
- `invoices/[invoiceId]/page.tsx` + `print-button.tsx` — contek persis pola cetak payslip
- `dashboard-shell.tsx` — tambah entri nav

**Keputusan minor yang boleh diambil saat implementasi** (tidak signifikan, tidak perlu ditanyakan lagi): skema penomoran invoice (sequential vs tanggal+random, ikuti pola `order_id` yang sudah ada kalau mau simpel).

**Verifikasi**: buat invoice dengan 2+ item + DP, pastikan subtotal/DP/sisa terhitung benar, preview cetak via dialog print browser (pastikan kontrol UI hilang saat print), tandai lunas, pastikan status di list berubah.

---

## Fase 5 — Kas Harian

**Tujuan**: Log uang masuk/keluar sederhana untuk kasir awam, sebagai lapisan tipis di atas mekanisme jurnal yang sudah ada (`post_journal_entry` RPC) — **bukan** tabel baru terpisah, supaya tetap satu sumber kebenaran akuntansi.

**File baru**: `kas-harian/page.tsx` (list gabungan masuk+keluar per tanggal, baca dari `journal_lines` yang tersambung akun kas), `kas-harian/actions.ts` (`addCashIn`/`addCashOut`, masing-masing manggil `post_journal_entry` dengan akun kas dilawan akun "Pendapatan Lain-lain"/"Beban Lain-lain" — **cek dulu kode akun sebenarnya di seed `daftar-akun` sebelum implementasi**).

**Verifikasi**: tambah 1 entri masuk + 1 keluar, cek muncul di Kas Harian dengan total benar, cross-check di `accounting/jurnal` bahwa jurnal yang diposting sama persis (akun & nominal) — ini regression test intinya karena nilai fitur ini adalah "UI simpel, akuntansi di baliknya tetap benar".

---

## Fase 6 — Notifikasi/Reminder Center

**Bergantung pada**: Fase 2 (field `contract_end`/`due_date` harus sudah ada & terisi) dan Fase 4 (tabel `invoices` harus ada).

**Tujuan**: Satu halaman agregasi: hutang jatuh tempo, invoice belum lunas, THR mendekat, payroll belum dibayar, karyawan kontrak mau habis.

**File baru**: `notifikasi/page.tsx` — query ke `purchases` (due_date dekat + belum lunas), `invoices` (due_date dekat + belum lunas), `employees` (contract_end dekat), `payslips` (belum dibayar), render list dengan badge severity (lewat/dekat/mendatang).

**Keputusan minor saat implementasi**: threshold "berapa hari dianggap dekat" per kategori — boleh mulai dari konstanta tetap dulu, tidak perlu setting page). Aturan waktu THR: pakai heuristik sederhana (mis. rentang tanggal tetap yang bisa diedit tahun depan) daripada sistem kompleks.

**Verifikasi**: siapkan data test yang match tiap kategori (pembelian jatuh tempo dekat, karyawan kontrak dekat habis, invoice belum lunas, payslip belum dibayar) → pastikan semua muncul dengan label benar; selesaikan masing-masing → pastikan hilang dari daftar saat reload.

---

## Fase 7 — Sinkronisasi Periode Global

**Tujuan**: Satu pilihan periode yang persist lintas halaman laporan/akuntansi, plus benerin `finance/page.tsx` yang punya type `Period` lokal tidak kompatibel dengan `reports/period.ts`.

**File diubah**: `finance/page.tsx` (pakai `Period`/`getPeriodRange` dari `reports/period.ts`, bukan definisi lokal), plus semua halaman yang sudah pakai `reports/period.ts` (laba-rugi, jurnal, neraca, arus-kas, dst.) disambungkan ke mekanisme "global" ini — pendekatan: simpan pilihan lewat **cookie** (paling cocok dengan pola server-component + `searchParams` yang sudah dominan di codebase ini, dibanding client-side context/localStorage).

**Verifikasi**: set periode di satu halaman, navigasi ke 3-4 halaman akuntansi/laporan lain, pastikan pilihan periode tidak reset; pastikan `finance/page.tsx` sekarang mendukung opsi `"custom"` yang sebelumnya tidak ada; pastikan CSV export yang sudah ada tetap konsisten dengan filter periode.

---

## Fase 8 — Redesain Visual Akuntansi/SDM (bertahap)

**Tujuan**: Tampilan lebih padat/profesional ala referensi AkunPro, warna disesuaikan ke brand hijau KasirKu (`--color-brand-500 #00a651` dkk di `globals.css`), **bukan** oranye referensi.

**Sub-fase (per keputusan "bertahap")**:
- **8a**: Bangun komponen bersama dulu (`stat-card`, `pill-badge`, dll di `src/components/ui/`) + reskin 2-3 halaman andalan (Daftar Akun, Laba Rugi).
- **8b**: Lanjut halaman Akuntansi sisanya (Jurnal, Neraca, Arus Kas, Anggaran, Modal, Transfer Kas, Tutup Buku) — Rekonsiliasi Rekening cuma reskin visual, logika sudah benar, tidak disentuh.
- **8c**: Halaman SDM (Payroll, Karyawan, Absensi, Rekap Absensi baru dari Fase 3).

**Catatan**: ini reskin visual murni — jangan ubah logika perhitungan di halaman manapun saat sesi ini, supaya risiko regresi kecil dan diff gampang direview.

**Verifikasi per sub-fase**: klik-through penuh tiap halaman yang direskin di browser preview (form tetap submit, data tetap tampil benar), bandingkan kepadatan layout dengan referensi tapi warna harus konsisten brand-500/600 di semua aksen yang tadinya oranye di referensi.

---

## Fase 9 — Halaman Marketing Finance Only

**Bergantung pada**: Fase 1 (harus ada plan nyata untuk dijual). Idealnya setelah sebagian Fase 8 selesai supaya tampilan yang dipromosikan sudah representatif, tapi tidak wajib menunggu semua sub-fase 8 kelar.

**File baru**: halaman marketing baru (slug URL perlu diputuskan, mis. `/sistem-akuntansi` atau `/akuntansi-sdm`) dengan copy yang menyasar spesifik "sudah punya kasir sendiri, cuma butuh akuntansi" — beda framing dari landing page utama KasirKu supaya tidak membingungkan calon pembeli POS biasa. CTA mengarah ke `/billing` (sesuai keputusan Fase 1) dengan plan Finance yang sudah tersedia di sana.

**Verifikasi**: klik-through penuh dari halaman marketing sampai berhasil pilih plan Finance Only di `/billing` dan dashboard ter-gate dengan benar (bukan cuma review visual halaman marketing-nya saja).

---

## Fase 10 — Export Excel Sekaligus

**Tujuan**: Satu tombol export yang mencakup banyak modul sekaligus, melengkapi CSV per-halaman yang sudah ada.

**File baru**: route export baru yang agregasi data dari modul-modul yang relevan (termasuk Invoice & Kas Harian kalau sudah dibangun). Cek dulu `package.json` apakah sudah ada library XLSX (`xlsx`/`exceljs`) sebelum menambah dependency baru — export yang ada sekarang semua CSV.

**Keputusan minor saat implementasi**: cakupan modul yang di-export (tidak harus "semua tabel", cukup laporan yang paling relevan) dan format (satu workbook multi-sheet vs beberapa file terpisah).

**Verifikasi**: jalankan export, buka file hasil, pastikan tiap sheet/bagian yang diharapkan ada dan angkanya konsisten dengan export CSV per-halaman yang sudah ada untuk bisnis/periode yang sama.

---

## Catatan Lintas Fase

- Semua fase reuse pola yang sudah ada: RLS helper `private.owns_business(business_id)`, pola `"use server"` + defense-in-depth ownership re-check + `revalidatePath`. Tidak ada gaya arsitektur baru yang diperkenalkan.
- Setiap fase independen — bisa dikerjakan & di-ship di sesi terpisah, tidak ada yang "setengah jadi" menghalangi demo fase lain (kecuali dependency eksplisit yang disebut: Fase 6 butuh Fase 2 & 4; Fase 9 butuh Fase 1).
- Urutan di atas adalah urutan yang disarankan, bukan wajib kaku — Fase 3/5/10 ("quick win", tanpa dependency) bisa diselipkan kapan saja kalau mau selingan dari fase yang lebih besar.
