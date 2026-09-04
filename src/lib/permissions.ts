// Single source of truth for admin-checklist permission keys/labels — kept
// in sync by hand with the `key` values in dashboard-shell.tsx's
// buildNavGroups(). A superset across all business types on purpose (e.g.
// "check-in" shows even for a non-tiket business) — granting a key that
// doesn't correspond to a nav item for this business's type is harmless,
// dashboard-shell only ever shows items that both exist for that business
// type AND are permitted.
export type PermissionGroup = { title: string; items: { key: string; label: string }[] };

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: "Utama",
    items: [
      { key: "pos", label: "Akses POS/Kasir" },
      { key: "reports", label: "Laporan" },
      { key: "transactions", label: "Riwayat Transaksi" },
      { key: "check-in", label: "Check-in Tiket" },
      { key: "ticket-reports", label: "Laporan Tiket" },
      { key: "members", label: "Anggota" },
      { key: "shifts", label: "Riwayat Shift" },
      { key: "kas-harian", label: "Kas & Bank" },
      { key: "products", label: "Kelola Produk" },
      { key: "modifiers", label: "Modifier Global" },
      { key: "ingredients", label: "Bahan Baku" },
      { key: "tables", label: "Meja & Self-Order" },
      { key: "customers", label: "Pelanggan" },
      { key: "cashiers", label: "Kelola Kasir" },
    ],
  },
  {
    title: "Fitur Lanjutan",
    items: [
      { key: "reports-laba-rugi", label: "Laba Rugi" },
      { key: "reports-cogs", label: "Laporan COGS" },
      { key: "hpp-calculator", label: "Kalkulator HPP" },
      { key: "reports-price-trend", label: "Tren Harga" },
      { key: "accounting-daftar-akun", label: "Daftar Akun" },
      { key: "accounting-laba-rugi", label: "Laba Rugi (Akrual)" },
      { key: "accounting-jurnal", label: "Jurnal Transaksi" },
      { key: "accounting-buku-besar", label: "Buku Besar" },
      { key: "accounting-neraca", label: "Neraca" },
      { key: "accounting-arus-kas", label: "Arus Kas" },
      { key: "accounting-anggaran", label: "Target vs Aktual" },
      { key: "accounting-modal", label: "Perubahan Modal" },
      { key: "accounting-transfer-kas", label: "Transfer Kas/Bank" },
      { key: "accounting-rekonsiliasi", label: "Rekonsiliasi Rekening" },
      { key: "invoices", label: "Invoice/Nota" },
      { key: "accounting-tutup-buku", label: "Tutup Buku" },
      { key: "receivables", label: "Piutang Pelanggan" },
      { key: "purchases", label: "Pembelian & Hutang" },
      { key: "purchase-requests", label: "Permintaan Barang" },
      { key: "purchase-orders", label: "Purchase Order" },
      { key: "purchase-orders-approve", label: "Setujui PO (Otorisasi Formal)" },
      { key: "purchase-orders-approve-l1", label: "Setujui PO — Level 1 (Manager/Supervisor)" },
      { key: "rab-pembelian", label: "RAB Pembelian" },
      { key: "kas-kecil", label: "Kas Kecil" },
      { key: "suppliers", label: "Supplier" },
      { key: "assets", label: "Aset Tetap" },
      { key: "employees", label: "Karyawan" },
      { key: "attendance", label: "Absensi" },
      { key: "jadwal-shift", label: "Jadwal Shift" },
      { key: "payroll", label: "Payroll" },
    ],
  },
  {
    title: "Produksi & Distribusi",
    items: [
      { key: "warehouses", label: "Gudang" },
      { key: "semi-finished-items", label: "Bahan Setengah Jadi" },
      { key: "finished-products", label: "Produk Jadi (HPP)" },
      { key: "laporan-persediaan", label: "Laporan Persediaan" },
      { key: "production-runs", label: "Produksi" },
      { key: "operasional", label: "Operasional (Kitchen & Bar)" },
      { key: "outlets", label: "Outlet" },
      { key: "outlet-requests", label: "Permintaan Resto" },
      { key: "warehouse-requests", label: "Permintaan Gudang" },
    ],
  },
  {
    title: "Lainnya",
    items: [
      { key: "notifikasi", label: "Notifikasi" },
      { key: "activity", label: "Aktivitas" },
      { key: "settings", label: "Pengaturan" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = new Set(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
);
