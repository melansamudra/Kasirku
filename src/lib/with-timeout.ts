// Membungkus sebuah promise dengan batas waktu tanpa membatalkan promise
// aslinya — kalau promise asli belakangan tetap selesai (sukses atau
// gagal) setelah timeout duluan yang menang, itu diam-diam diabaikan
// (bukan unhandled rejection) karena promise hanya bisa settle sekali.
// Dipakai pos-screen.tsx / ticket-pos-screen.tsx untuk mendeteksi checkout
// yang macet karena jaringan tanpa membuat kasir menunggu tanpa batas.
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
