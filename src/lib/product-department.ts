// Pemetaan nama lokasi (stock_locations) -> divisi produk (products.department).
// Berbasis NAMA lokasi, bukan kolom terpisah -- cukup untuk setup Adi's
// Culinary sekarang (lokasi memang bernama persis "Kitchen"/"Bar"). Kalau
// lokasi di-rename jadi sesuatu yang tidak mengandung kata kunci ini,
// halaman "Data Produk" lokasi itu tidak akan menemukan produk apa pun --
// keterbatasan yang disengaja demi kesederhanaan, bukan bug.
export function departmentForLocationName(locationName: string): "dapur" | "bar" | "front" | null {
  const n = locationName.toLowerCase();
  if (n.includes("kitchen") || n.includes("dapur")) return "dapur";
  if (n.includes("bar")) return "bar";
  if (n.includes("front") || n.includes("kasir")) return "front";
  return null;
}
