// Gate tambahan untuk rute stok multi-lokasi (kartu stok, transfer, stock
// opname, PO, BSJ ringan) yang dibuka untuk bisnis FnB standar lewat
// `stock_locations_enabled`, TANPA menyalakan `cost_control_enabled` (yang
// sifatnya all-or-nothing dan mengganti total nav & dashboard ke gaya Llauk).
export function hasStockLocationAccess(business: {
  cost_control_enabled: boolean | null;
  stock_locations_enabled: boolean | null;
}): boolean {
  return !!(business.cost_control_enabled || business.stock_locations_enabled);
}
