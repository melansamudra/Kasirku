# Kasirku Android

Aplikasi Android untuk toko yang kasirnya cuma pakai tablet Android (tanpa PC sama sekali) —
membungkus situs Kasirku (`https://createimpact.id`) di WebView native, ditambah kemampuan yang
tidak bisa dilakukan browser biasa: kirim tiket dapur/bar langsung ke printer LAN maupun Bluetooth
dari tablet itu sendiri, tanpa perlu jembatan device lain.

## Kenapa ini perlu ada

Browser (termasuk browser di Android) tidak bisa membuka raw TCP socket atau Bluetooth Classic SPP
ke printer thermal — batasan platform, bukan bug. Untuk toko yang punya PC Windows, batasan ini
diatasi lewat `print-agent/` (jembatan lokal terpisah). Tapi kalau kasirnya CUMA punya tablet
Android, tidak ada PC untuk menjalankan agent itu.

Solusinya: bungkus Kasirku jadi aplikasi Android asli (via Capacitor), lalu tambahkan satu plugin
native kecil (`KitchenPrinterPlugin.kt`) yang punya akses langsung ke socket TCP dan Bluetooth
Classic dari sistem operasi — sesuatu yang HANYA bisa dilakukan aplikasi native, bukan halaman web.
`server.url` di `capacitor.config.ts` mengarah langsung ke situs live (bukan bundle offline) —
Kasirku penuh Server Actions, jadi versi statis tidak mungkin dibuat; WebView ini murni pembungkus,
semua logika bisnis tetap jalan di server yang sama seperti versi web.

Struk kasir sendiri (bukan tiket dapur/bar) TIDAK terpengaruh fitur ini — itu tetap `window.print()`
seperti biasa, diarahkan ke print service Bluetooth level-OS Android yang sudah berjalan sebelumnya.

---

## Instalasi di tablet kasir (untuk pemilik toko, bukan developer)

Tidak lewat Play Store — instal langsung dari file `.apk` yang dikirim developer.

1. Minta file `app-release.apk` dari developer (lewat link download atau transfer file).
2. Buka file itu di tablet. Kalau muncul peringatan "aplikasi tidak dikenal"/"blocked by Play
   Protect": ini normal untuk aplikasi internal yang belum didaftarkan ke Play Store, bukan virus —
   pilih **Install anyway** / **Izinkan dari sumber ini**.
3. Buka aplikasi Kasirku yang baru ter-install, login seperti biasa.
4. Untuk printer dapur/bar: buka Pengaturan → Printer Dapur & Bar → Tambah Printer. Kalau pilih
   Bluetooth, pasangkan dulu printernya lewat Pengaturan Bluetooth bawaan Android (sekali saja),
   baru pilih dari daftar yang muncul di form ini.

**Update aplikasi**: tidak otomatis (bukan dari Play Store) — minta APK terbaru dari developer dan
instal ulang saat ada versi baru. APK release harus selalu ditandatangani dengan keystore yang sama
supaya bisa update di tempat (lihat bagian Developer di bawah); kalau tidak, tablet harus uninstall
dulu versi lama baru instal yang baru (data lokal di app ini minimal, jadi tidak masalah).

---

## Developer — setup & build

Butuh JDK 21 dan Android SDK (command-line tools cukup, tidak perlu Android Studio penuh) —
`ANDROID_HOME`/`JAVA_HOME` sudah harus ter-set.

```bash
npm install
npx cap sync android
cd android
./gradlew.bat assembleDebug     # APK debug, self-signed otomatis oleh Android
```

### Build APK release (untuk dikirim ke toko)

1. Sekali saja: buat keystore release (JANGAN pernah commit file ini):
   ```bash
   cd android
   keytool -genkeypair -v -keystore kasirku-release.keystore -alias kasirku \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Buat `android/keystore.properties` (gitignored) isinya:
   ```properties
   storeFile=kasirku-release.keystore
   storePassword=...
   keyAlias=kasirku
   keyPassword=...
   ```
3. Build:
   ```bash
   ./gradlew.bat assembleRelease
   ```
   Hasil: `android/app/build/outputs/apk/release/app-release.apk`, sudah ditandatangani.

**Simpan `kasirku-release.keystore` + password baik-baik (backup di tempat aman).** Kalau hilang,
update APK ke tablet yang sudah pakai versi lama tidak bisa lagi dilakukan in-place (Android
mewajibkan signing key yang sama persis untuk update) — semua tablet harus uninstall+instal ulang
dari nol.

### Testing terhadap build lokal (bukan production)

`capacitor.config.ts` yang di-commit selalu mengarah ke production
(`https://createimpact.id`). Untuk tes terhadap `next start` lokal: pakai
`capacitor.config.dev.ts` (gitignored, contoh ada di riwayat git/minta ke developer lain), arahkan
`server.url` ke `http://localhost:PORT`, salin sementara ke `capacitor.config.ts`, `npx cap sync
android`, build, lalu **kembalikan `capacitor.config.ts` ke production sebelum build release**. Dari
emulator Android, host machine diakses lewat `adb reverse tcp:PORT tcp:PORT` (lebih andal daripada
`10.0.2.2` kalau kena Windows Firewall).

## Struktur plugin native

`android/app/src/main/java/id/createimpact/kasirku/KitchenPrinterPlugin.kt` — satu plugin
Capacitor, method:

- `printLan({ip, port, bytesBase64})` — buka raw `Socket` TCP, sama persis polanya dengan
  `print-agent/src/printSocket.ts`.
- `printBluetooth({address, bytesBase64})` — Bluetooth Classic SPP
  (`createRfcommSocketToServiceRecord`, fallback ke insecure socket kalau printer menolak secure).
- `listPairedBluetoothDevices()` — HANYA baca `bluetoothAdapter.bondedDevices`, tidak pernah
  `startDiscovery()` — ini yang membuat aplikasi ini tidak perlu izin lokasi sama sekali. Kasir
  pasangkan printer lewat Settings Bluetooth Android biasa, aplikasi tinggal baca yang sudah
  ter-bond.
- `isBluetoothEnabled()` — cek radio Bluetooth aktif/tidak, dan ada/tidaknya adapter BT di device.

Sisi web yang memanggil plugin ini ada di app utama (`H:\Kasirku`, bukan folder ini):
`src/lib/kitchen-printer-plugin.ts` (wrapper `registerPlugin`) dan `src/lib/dispatch-print-jobs.ts`
(percabangan native vs print-agent vs unsupported-di-browser-biasa).

**Catatan verifikasi:** jalur Bluetooth Classic SPP ke printer thermal sungguhan belum bisa dites
di lingkungan pengembangan ini (tidak ada tablet/printer BT fisik) — wajib dites di device+printer
asli (idealnya 2-3 merek) sebelum dipakai toko yang sepenuhnya mengandalkan tablet.
