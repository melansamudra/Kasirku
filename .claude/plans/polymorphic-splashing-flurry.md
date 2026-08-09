# Kasirku: Android kasir app (Capacitor) — cetak dapur/bar LAN & Bluetooth tanpa PC

## Context

Kasus: toko yang kasirnya cuma pakai tablet Android, tanpa PC sama sekali. Struk kasir tetap
lewat Bluetooth seperti sekarang (itu bukan kode Kasirku — `window.print()` diarahkan ke print
service Bluetooth level-OS Android, TIDAK disentuh oleh rencana ini). Yang belum ada solusinya:
tiket CO ke dapur dan bar. `print-agent/` (dibangun sesi ini) mengatasi LAN printing tapi WAJIB
ada PC Windows yang nyala — tidak berlaku untuk toko yang cuma punya tablet. Bluetooth untuk
printer dapur/bar juga **belum pernah diimplementasi sama sekali** — `connection_type` di
`kitchen_printers` sudah menerima `'bluetooth'`, tapi `buildKitchenPrintJobs`
(`src/lib/kitchen-print.ts`) memfilternya keluar (`connection_type === "lan"` saja), dan tidak
ada kode Web Bluetooth di mana pun (dikonfirmasi lewat pencarian repo-wide: nol hasil untuk
`navigator.bluetooth`/`BluetoothDevice`/`requestDevice`/GATT).

Melan minta strategi seperti Moka POS: aplikasi Android yang di-download (bukan lewat Play
Store — di-sideload lewat link download langsung, APK self-signed, tidak perlu akun Google Play
Developer), dengan pengaturan printer LAN maupun Bluetooth ada DI DALAM aplikasi itu sendiri,
tanpa perlu tambahan apa pun secara fisik di dapur/bar.

Mesin dev ini saat ini **nol tooling Android** (tidak ada JDK/Android SDK/Gradle/Studio,
dikonfirmasi lewat pengecekan bersih). Melan sudah setuju saya install JDK + Android SDK
command-line tools (bukan Android Studio penuh) di sini supaya bisa langsung build & tes APK.

## Pendekatan

**Capacitor** (bukan React Native, bukan custom WebView project dari nol, bukan TWA) yang
membungkus situs Kasirku yang sudah live (`server.url: "https://createimpact.id"`, BUKAN static
bundle — app ini penuh Server Actions, tidak bisa di-export statis), plus **satu plugin native
Kotlin custom** untuk 2 hal yang browser tidak bisa: buka raw TCP socket (LAN), dan Bluetooth
Classic SPP (BT). React Native ditolak karena tetap butuh WebView di dalamnya untuk reuse app
existing — cuma nambah kompleksitas tanpa untung. TWA ditolak karena tidak punya jembatan
JS↔native sama sekali (justru inti dari kebutuhan ini). Custom WebView-dari-nol ditolak karena
Capacitor sudah menyediakan primitif teruji (plugin bridge, permission handling, dsb) yang kalau
ditulis ulang manual cuma buang waktu tanpa keuntungan nyata.

**Login flow aman untuk pendekatan `server.url`**: `src/app/login/page.tsx` pakai
`supabase.auth.signInWithPassword` langsung di halaman (bukan redirect/OAuth eksternal) — jadi
alur login utama kasir tidak pernah keluar dari WebView. Satu-satunya titik yang keluar ke browser
sungguhan adalah `src/app/auth/callback/route.ts` (link reset-password/konfirmasi email dari
klien email) — itu memang wajar dibuka di browser biasa, di luar scope.

### 1. Native plugin (`KitchenPrinterPlugin`, Kotlin)
- `printLan({ip, port, bytesBase64, timeoutMs?})` → mirip persis `print-agent/src/printSocket.ts`
  (`java.net.Socket`, connect+write+close, off-main-thread lewat `Dispatchers.IO`), pakai
  kosakata error yang sama (`connect_timeout`, dst) supaya konsisten dengan jalur print-agent yang
  sudah ada.
- `printBluetooth({address, bytesBase64, timeoutMs?})` → `BluetoothAdapter.getRemoteDevice(address)`
  → `createRfcommSocketToServiceRecord(SPP_UUID)` (UUID SPP standar
  `00001101-0000-1000-8000-00805F9B34FB`) → connect (off-main-thread) → tulis bytes → close.
  Coba secure socket dulu, fallback ke `createInsecureRfcommSocketToServiceRecord` kalau gagal
  (variasi stack printer di lapangan — lihat bagian Verifikasi soal batasannya).
- `listPairedBluetoothDevices()` → HANYA baca `bluetoothAdapter.bondedDevices`, **tidak pernah**
  `startDiscovery()`. Ini pilihan desain penting: kasir pairing printer sekali lewat Settings
  Bluetooth bawaan Android (alur normal), app tinggal baca yang sudah ter-bond — dengan begini
  **tidak perlu izin lokasi sama sekali** (izin lokasi cuma wajib untuk active scanning, bukan
  baca bonded devices).
- `isBluetoothEnabled()` → cek radio BT nyala/tidak, dan ada/tidaknya adapter BT sama sekali.
- Permission: `BLUETOOTH_CONNECT` (Android 12+, runtime/dangerous), `BLUETOOTH`/`BLUETOOTH_ADMIN`
  (≤30, install-time). `INTERNET` sudah implisit dibutuhkan WebView. **Tidak** minta
  `BLUETOOTH_SCAN`/lokasi apa pun — konsekuensi langsung dari "bonded-only" di atas.

### 2. Perubahan sisi web (bundle yang sama dipakai browser biasa maupun di dalam WebView)
- `@capacitor/core` jadi dependency baru di `H:\Kasirku\package.json` (root, bukan cuma di
  project Android) — `src/lib/kitchen-printer-plugin.ts` baru, `registerPlugin<KitchenPrinterPlugin>("KitchenPrinter")`,
  no-op aman di browser biasa (`Capacitor.isNativePlatform()` → `false`).
- `src/lib/kitchen-print.ts`: hapus filter `connection_type === "lan"`, tambah field
  `connectionType: "lan" | "bluetooth"` ke `KitchenPrintJobPayload` supaya client tahu transport
  mana yang dipakai per job (sebelumnya ambigu karena BT selalu difilter habis). Ini otomatis bikin
  test `"ignores bluetooth printers (LAN dispatch only)"` di `kitchen-print.test.ts` salah —
  ditulis ulang jadi test yang menegaskan BT job juga ikut terbentuk.
- `src/lib/dispatch-print-jobs.ts`: percabangan PER JOB (bukan cuma native-vs-web), karena browser
  biasa (PC+print-agent) sekarang juga bisa terima job bertipe bluetooth dari server:
  - Native platform + LAN → `KitchenPrinter.printLan(...)`
  - Native platform + Bluetooth → `KitchenPrinter.printBluetooth(...)`
  - Browser biasa + LAN → `printViaAgent(...)` (jalur print-agent yang sudah ada, TIDAK berubah)
  - Browser biasa + Bluetooth → gagal langsung dengan error `unsupported_on_web` (tanpa network
    call sia-sia) — normal, karena BT dari toko yang punya PC tetap harus lewat app Android kalau
    memang begitu setupnya.
- `settings/add-printer-form.tsx`: kalau `connectionType === "bluetooth"` DAN
  `Capacitor.isNativePlatform()` → ganti input teks bebas jadi picker dari
  `KitchenPrinter.listPairedBluetoothDevices()` (isi `address` dengan MAC asli). Di browser biasa
  (termasuk saat halaman Settings dibuka dari PC), tetap fallback ke input teks bebas seperti
  sekarang — tidak ada regresi untuk workflow yang sudah ada.
- Migration kecil, aditif, tanpa backfill: `alter table kitchen_printers add column device_label text`
  (nullable) — supaya daftar printer di Settings tetap menampilkan nama ramah ("Printer Dapur 1"),
  bukan MAC address mentah, begitu address diisi otomatis oleh picker native.

### 3. Lokasi project
Folder baru top-level `H:\Kasirku\android-app\` (sejajar dengan `print-agent/` dan
`desktop-app/` yang sudah ada duluan — pola yang sama, terisolasi dari build Next.js). Tidak
perlu bundling web app sendiri (tidak pakai `webDir`, karena `server.url` langsung ke situs live)
— cukup `capacitor.config.ts`, `package.json` (`@capacitor/core`, `@capacitor/android`,
`@capacitor/cli`), dan folder `android/` hasil `npx cap add android` (berisi source Kotlin
plugin-nya).

### 4. Setup tooling (mesin ini, saat ini kosong sama sekali)
JDK 21 (Eclipse Temurin) → Android SDK command-line tools only (bukan Android Studio penuh) →
`sdkmanager` untuk platform-tools + platform + build-tools → scaffold via `npx cap init`/
`cap add android`. Versi Capacitor dikonfirmasi **8.4.2** (dicek langsung ke npm registry hari
ini). Versi compileSdk/AGP/Kotlin persis akan dikonfirmasi dari requirement `@capacitor/android`
yang ter-install nanti (bukan di-hardcode dari ingatan/asumsi sekarang), supaya tidak salah pin.

## Verifikasi

**Bisa diverifikasi penuh di sesi ini:**
- Emulator: WebView memuat `https://createimpact.id`, login `signInWithPassword` sukses di dalam
  WebView (memvalidasi keputusan arsitektur `server.url` sebelum lanjut ke kerjaan plugin native).
- Jalur LAN: sama seperti verifikasi `print-agent` sesi ini — jalankan fake TCP listener di mesin
  dev, panggil `printLan` dari emulator (emulator akses host lewat `10.0.2.2`), pastikan byte
  sampai persis dan `{ok:true}`/`{ok:false}` sesuai skenario (timeout, connection refused).
- `kitchen-print.test.ts`/`escpos.test.ts` (Vitest, sudah ada) — diperluas untuk `connectionType`
  dan perilaku "job bluetooth sekarang ikut terbentuk".

**TIDAK bisa diverifikasi penuh di sesi ini — disampaikan terus terang, bukan diabaikan:**
- **Bluetooth Classic SPP ke printer thermal sungguhan.** Tidak ada device Android maupun printer
  BT fisik di sini. Emulator Android tidak mengemulasikan radio Bluetooth sungguhan untuk
  pairing/connect ke hardware nyata. Variasi antar chipset printer (dukungan secure vs insecure
  RFCOMM, kestabilan koneksi) genuinely tidak bisa dites tanpa hardware asli. Ini WAJIB dites di
  device+printer sungguhan (idealnya 2-3 merek berbeda) sebelum dipakai di toko manapun yang
  bergantung sepenuhnya pada tablet — ditandai sebagai blocker rollout, bukan blocker kode selesai.

## Tahapan

0. **Tooling bring-up** — JDK, Android SDK cmdline-tools, `ANDROID_HOME`/`JAVA_HOME`, pastikan
   `sdkmanager`/`gradlew` jalan. Belum ada kode app.
1. **Scaffold + pastikan WebView memuat situs live** — `android-app/` dibuat, `server.url` ke
   createimpact.id, build debug, install ke emulator, login sukses di dalam WebView. Ini
   memvalidasi taruhan arsitektur paling dasar sebelum investasi kerjaan plugin native.
2. **Plugin native LAN** — `printLan` di Kotlin, sambungkan `kitchen-printer-plugin.ts` +
   percabangan di `dispatch-print-jobs.ts` untuk kasus LAN saja dulu (job bluetooth masih
   difilter server-side di tahap ini — increment teraman), verifikasi ke fake TCP listener.
3. **Bluetooth** — hapus filter di `kitchen-print.ts`, tambah `connectionType`/`device_label`
   (migration + `actions.ts` + `add-printer-form.tsx` + `settings/page.tsx`), implementasi
   `printBluetooth`/`listPairedBluetoothDevices`/`isBluetoothEnabled`, permission manifest,
   sambungkan sisa percabangan di `dispatch-print-jobs.ts`. Update `kitchen-print.test.ts`. Tahap
   ini selesai secara kode tapi Bluetooth-ke-hardware-asli masih belum terverifikasi.
4. **Packaging & distribusi** — release keystore (self-signed), `assembleRelease`, dokumentasi
   instal untuk pemilik toko (nada sama seperti `print-agent/README.md` — termasuk peringatan
   "unknown publisher" saat instal APK di luar Play Store).
5. **Validasi hardware asli** (blocker rollout, bukan blocker kode) — tes di tablet Android
   sungguhan + 2-3 merek printer BT sebelum dipakai toko yang cuma mengandalkan tablet.

### File kunci
- `src/lib/kitchen-print.ts`, `src/lib/kitchen-print.test.ts`, `src/lib/dispatch-print-jobs.ts`
- `src/lib/kitchen-printer-plugin.ts` (baru)
- `src/app/business/[businessId]/(dashboard)/settings/{add-printer-form.tsx,actions.ts,page.tsx}`
- `supabase/migrations/<timestamp>_kitchen_printers_device_label.sql` (baru)
- `android-app/capacitor.config.ts`, `android-app/android/app/src/main/java/.../KitchenPrinterPlugin.kt` (baru)

---

# Kasirku: print agent lokal — perbaiki jalur cetak dapur/bar LAN

## Context

Ditemukan saat scoping "Halaman Pengaturan Printer": `dispatchKitchenPrint`
(`src/lib/kitchen-print.ts`) membuka koneksi TCP mentah (`net.Socket`) ke IP printer **dari dalam
Server Action** (`checkout()`/`updateSelfOrderStatus()` di `pos/actions.ts`, jalan di Vercel).
Server Vercel tidak bisa menjangkau IP privat (`192.168.x.x`) milik jaringan toko — ini bukan bug
kode, ini batas jaringan yang pasti terjadi. Dikonfirmasi Anda: **belum ada client yang pernah
berhasil cetak lewat LAN**, cocok dengan analisis ini.

Perbaikannya: pindahkan pengiriman byte ke printer supaya dilakukan dari **browser kasir** (yang
secara fisik ada di jaringan toko yang sama dengan printer), lewat sebuah **print agent** kecil
yang jalan di komputer kasir — pola yang sudah terbukti berhasil dipakai di project lain (`H:\Ady's
Kulineri Project\apps\print-agent`): agent local-only (`127.0.0.1`) menerima `{ip, port, bytes}`
dari browser, lalu dia yang membuka socket TCP ke printer (karena dia satu jaringan dengan printer).

**Scope**: cuma jalur LAN (yang sudah ada tapi salah tempat eksekusi). Bluetooth tetap di backlog
terpisah (butuh kerjaan lain: transport BLE, bukan masalah lokasi eksekusi).

## Pendekatan

Pisahkan "membangun tiket" (tetap server-side, aman, tidak berubah) dari "mengirim byte ke
printer" (pindah ke client-side lewat agent). `checkout()`/`updateSelfOrderStatus()` di
`pos/actions.ts` **tidak diubah logika transaksinya** — cuma bagian ekor (dispatch cetak dapur)
diganti dari "kirim sekarang, server-side" jadi "siapkan job, kembalikan ke client, client yang
kirim". Ini menjaga RPC finansial (`checkout_transaction`) dan alur checkout inti sama sekali tidak
tersentuh — resiko rendah meski filenya sensitif.

### 1. `print-agent/` (baru, standalone, bukan bagian build Next.js — Kasirku bukan monorepo)
Kloning arsitektur `H:\Ady's Kulineri Project\apps\print-agent` (`server.ts`, `printSocket.ts`,
`config.ts`, `README.md`, `package.json`, `tsconfig.json`) — HTTP server local-only di
`127.0.0.1:9123`, `GET /health`, `POST /print {ip, port, bytes}` (bytes base64) → buka TCP ke
printer, balas `{ok}`/`{ok:false, error}`. CORS dibatasi origin lewat env
`PRINT_AGENT_ALLOWED_ORIGINS` (harus di-set ke `https://createimpact.id` di komputer kasir asli).

### 2. `src/lib/kitchen-print.ts`
`dispatchKitchenPrint` (build tiket + kirim TCP jadi satu) dipecah: fungsi baru
`buildKitchenPrintJobs(supabase, businessId, job)` — logika pencocokan printer/kategori & bangun
tiket (`buildKitchenTicket`, tidak berubah) tetap sama, tapi return
`{ printerName, address, bytesBase64 }[]` (base64 dari `Buffer`, aman di server) — **tidak lagi
membuka `net.Socket`**. `sendToLanPrinter`/import `net` dihapus dari file ini (pindah konsep ke
agent).

### 3. `src/lib/print-agent-client.ts` (baru, client-safe)
`printViaAgent(address, bytesBase64)` — pola sama seperti
`H:\Ady's Kulineri Project\apps\web\lib\print\agent-client.ts`: fetch ke
`NEXT_PUBLIC_PRINT_AGENT_URL` (default `http://127.0.0.1:9123`) `/print`, kembalikan
`{ok:true}` atau `{ok:false, reason:'agent_unreachable'|'printer_unreachable', error}`.

### 4. `pos/actions.ts`
- `CheckoutResult` & hasil `updateSelfOrderStatus`: tambah field `printJobs: {printerName, address,
  bytesBase64}[]` (opsional/kosong kalau tidak ada item dapur atau retry idempotent).
- `checkout()`: panggilan ke `printKitchenTicketsForItems` (yang sekarang dispatch server-side)
  diganti jadi memanggil `buildKitchenPrintJobs` dan menaruh hasilnya ke `printJobs` pada return
  value — **tidak ada lagi try/dispatch/logActivity kegagalan cetak di server**, itu pindah ke
  client (poin 5).
- `updateSelfOrderStatus()`: sama, saat status `"diproses"`.
- Action baru kecil `logKitchenPrintFailures(businessId, failures)` — cuma `logActivity(...,
  "sistem", "warning", ...)`, dipanggil client setelah agent selesai coba kirim.

### 5. Dispatch di client
Helper baru `src/lib/dispatch-print-jobs.ts` (client) — `dispatchPrintJobs(businessId, jobs)`:
loop `printViaAgent` per job, kumpulkan yang gagal, panggil `logKitchenPrintFailures` kalau ada
yang gagal. Dipanggil (fire-and-forget, tidak menghalangi UI) dari 3 tempat:
- `pos-screen.tsx` `handleConfirmPayment` — setelah `result.success` (jalur checkout langsung).
- `src/hooks/use-offline-sync.ts` — setelah `result.success` di cabang `sale.kind === "retail"`
  (jalur retry offline, supaya tiket tetap tercetak walau checkout tadinya sempat offline).
- `pos-screen.tsx` `handleOrderStatus`/pemicu self-order "diproses" — setelah sukses.

### 6. Dokumentasi
- `.env.example`: tambah `NEXT_PUBLIC_PRINT_AGENT_URL=http://127.0.0.1:9123` + komentar.
- `print-agent/README.md`: instruksi jalanin di komputer kasir (persis pola project lain), plus
  catatan cara set `PRINT_AGENT_ALLOWED_ORIGINS=https://createimpact.id` untuk production.
- Root `package.json`: tambah script convenience `"print-agent": "npm --prefix print-agent run
  start"`.

## Verifikasi

- `npx tsc --noEmit` dan `npx eslint` di `H:\Kasirku` (app utama) dan di `print-agent/` terpisah.
- Karena butuh printer LAN sungguhan untuk tes penuh (yang saya tidak punya), verifikasi realistis:
  1. Jalankan print-agent lokal (`cd print-agent && npm install && npm start`), cek `GET /health`
     jawab `{ok:true}`.
  2. Dari browser POS (production build, sama seperti fitur-fitur sebelumnya), checkout dengan item
     kategori yang di-assign ke printer LAN test (bisa pakai IP palsu/`nc -l` sebagai printer tiruan
     di komputer lokal untuk membuktikan byte benar-benar terkirim, tanpa printer fisik).
  3. Konfirmasi: transaksi tetap sukses meski agent MATI/printer tidak ada (kegagalan cetak tidak
     boleh menggagalkan penjualan — ini prinsip yang sudah ada, harus tetap terjaga).
  4. Konfirmasi jalur retry offline & self-order "diproses" juga memicu dispatch dengan pola yang
     sama (baca kode + tes manual kalau memungkinkan).
- Tidak ada migration DB untuk fitur ini.
- Setelah lolos verifikasi kode, push ke production — tapi **cetak LAN baru benar-benar aktif kalau
  cashier menginstal & menjalankan print-agent di komputer mereka** — ini perlu disampaikan jelas
  ke Anda/client sebagai langkah operasional tambahan (bukan otomatis begitu kode di-deploy).
