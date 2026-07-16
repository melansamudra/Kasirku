// "Hari ini" menurut jam Indonesia (WIB), sebagai string YYYY-MM-DD.
//
// JANGAN pakai `new Date().toISOString().slice(0, 10)` untuk "hari ini" —
// itu tanggal UTC, yang antara jam 00:00–07:00 WIB masih menunjuk ke
// *kemarin*. Akibat nyatanya (bug yang pernah terjadi): Neraca default
// menampilkan posisi kemarin dan transaksi dini hari tersembunyi, form-form
// tanggal ter-prefill tanggal kemarin, dll. Konvensi timezone yang sama
// juga dipakai reports/period.ts (REPORT_TIMEZONE).
export function todayWibDateString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
