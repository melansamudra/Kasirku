// Gate tambahan untuk rute stok multi-lokasi (kartu stok, transfer, stock
// opname, PO, BSJ ringan) yang dibuka untuk bisnis FnB standar lewat
// `stock_locations_enabled`, TANPA menyalakan `cost_control_enabled` (yang
// sifatnya all-or-nothing dan mengganti total nav & dashboard ke gaya Llauk).
// `rich_stock_ops_enabled` (Llauk pasca-konversi ke tampilan Kasirku standar)
// ikut dihitung di sini juga -- bisnis itu tetap butuh akses stok per lokasi
// yang sama persis seperti waktu masih cost_control_enabled.
export function hasStockLocationAccess(business: {
  cost_control_enabled: boolean | null;
  stock_locations_enabled: boolean | null;
  rich_stock_ops_enabled?: boolean | null;
}): boolean {
  return !!(business.cost_control_enabled || business.stock_locations_enabled || business.rich_stock_ops_enabled);
}
