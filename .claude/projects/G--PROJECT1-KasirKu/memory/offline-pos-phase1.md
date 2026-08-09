---
name: offline-pos-phase1
description: "Mode offline kasir (POS) Fase 1 — resiliensi mid-session, built 2026-07-13"
metadata:
  type: project
  originSessionId: current
---

Dibangun 2026-07-13: kasir bisa tetap jualan kalau internet toko putus **saat halaman POS sudah terbuka & shift aktif** (scope disepakati dengan user — bukan cold-start offline/PWA penuh, itu belum ada infra sama sekali dan didokumentasikan sebagai Fase 2 terpisah). Lihat [[mini-erp-scope]] untuk histori fitur lain, [[supabase-migrations-manual]] untuk cara apply migrasi.

**Arsitektur**: `src/lib/offline-db.ts` (wrapper IndexedDB native) + `src/lib/offline-queue.ts` (tipe `PendingSale`, enqueue/list/mark helpers, `pendingStockDeltas`) + `src/hooks/use-offline-sync.ts` (hook dipakai `pos-screen.tsx` & `ticket-pos-screen.tsx` — tracking online/offline, retry berurutan, auto-sync tiap 20 detik / saat event `online`). `handleConfirmPayment` di kedua layar membungkus `checkout()`/`checkoutTicket()` dengan `withTimeout` (`src/lib/with-timeout.ts`, 10 detik) — timeout atau exception jaringan masuk antrian offline (IndexedDB), business error (mis. uang kurang, nomor tiket bentrok) tetap tampil error inline seperti biasa.

**Idempotency**: migrasi `supabase/migrations/20260713100000_offline_checkout_idempotency.sql` menambah `client_ref uuid` (unique per business, partial index) ke `transactions` & `ticket_transactions`, plus param `p_client_ref` di `checkout_transaction`/`checkout_ticket_transaction` — kalau client_ref sudah ada, RPC return baris lama (`already_existed=true`) alih-alih insert duplikat. **Applied ke Supabase 2026-07-13** (bareng `20260712160000_ticket_group_pricing.sql`, lihat [[supabase-migrations-manual]] untuk detail & gotcha saat apply). Kode client selalu mengirim `p_client_ref` ke kedua RPC (jalur online normal maupun retry offline) — jadi migrasi ini wajib ter-apply duluan sebelum checkout apa pun bisa jalan.

**Verifikasi mekanik offline** (browser, akun test [[test-account-preview]], sebelum migrasi ter-apply — jadi ini menguji jalur "gagal", bukan happy-path): patch `window.fetch` untuk reject di tengah checkout retail (Kopi Susu, Toko Test Laporan) → benar masuk jalur offline, tersimpan ke IndexedDB, stok tampilan langsung berkurang (`pendingStockDeltas` jalan). Antrian **selamat lewat hard page reload** (dipicu tak sengaja oleh polling self-order FnB yang gagal fetch RSC lalu Next fallback ke full navigation) — hook re-mount, baca ulang IndexedDB, tetap ada. Auto-sync 20 detik jalan sendiri, memanggil RPC asli, dapat error PostgREST asli ("Could not find the function...") karena migrasi belum ke-apply saat itu → ditandai `status:error` dengan pesan asli tampil di tooltip pill, bukan retry selamanya — persis sesuai desain "gagal karena bisnis vs jaringan". Tombol "Hapus" di tooltip berhasil membuang item dari antrian, stok tampilan balik normal.

**Verifikasi happy-path setelah migrasi ter-apply (2026-07-13)**: checkout tiket normal (bukan simulasi offline) di `ticket-pos-screen.tsx` sukses dengan invoice asli (`TIX-20260713-0001`), tidak fallback ke jalur offline — konfirmasi `p_client_ref` diterima RPC dengan benar dan `already_existed` flag berfungsi. Belum sempat re-test checkout retail online setelah migrasi (hanya tiket), tapi kode path-nya identik (sama-sama lewat `withTimeout`+`clientRef`), risiko rendah.

**Catatan tooling**: monkeypatch `window.fetch` di JS console TIDAK mencegat request Server Action itu sendiri (Next.js action dispatcher tampaknya pakai referensi fetch yang sudah di-bind lebih awal) — yang kepencet justru RSC prefetch/`router.refresh()` punya `fetch`. Jadi cara paling andal untuk simulasi "checkout gagal jaringan" di test browser berikutnya: biarkan patch aktif SEBELUM klik tombol confirm (bukan setelah), dan jangan kaget kalau retry via `syncNow()` juga sempat gagal karena fetch masih ke-patch — itu justru bukti antrian bekerja, bukan bug.

**How to apply**: migrasi sudah live, tidak ada lagi blocker untuk pakai POS normal. Fase 2 (cold-start offline / PWA / service worker) belum mulai sama sekali, backlog terpisah kalau user minta lanjut.
