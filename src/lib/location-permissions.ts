import type { PermissionGroup } from "./permissions";
import { departmentForLocationName } from "./product-department";

// Kelola Admin (permissions.ts/PERMISSION_GROUPS) itu daftar TETAP, tapi
// menu per-lokasi cost-control (Dapur Produksi/Purchasing) dibuat otomatis
// per baris `stock_locations` di `buildCostControlNavGroups`
// (dashboard-shell.tsx) -- jumlah & key-nya beda-beda tiap bisnis tergantung
// berapa lokasi yang ada. Fungsi ini menghasilkan grup checklist TAMBAHAN
// yang dibaca dari lokasi bisnis yang sebenarnya, supaya Owner bisa kasih
// izin per lokasi juga -- bukan cuma menu yang sama untuk semua bisnis.
//
// PENTING: key & syarat kemunculannya di sini HARUS SAMA PERSIS dengan
// `buildCostControlNavGroups` di dashboard-shell.tsx (di-cross-check manual,
// sama seperti PERMISSION_GROUPS vs buildNavGroups) -- kalau nanti nambah
// menu per-lokasi baru di sidebar, tambahkan juga di sini.
//
// Kitchen Atas/Bar Llauk (bukan produksi, bukan default-purchase) SENGAJA
// tidak dapat baris di sini -- mereka digabung 1 pintu masuk "Operasional"
// (key statis "operasional" di permissions.ts), bukan menu per-lokasi
// sendiri-sendiri (keputusan desain commit 9ceff5d).
export type LocationForPermissions = {
  id: string;
  name: string;
  isProduction: boolean;
  isDefaultPurchase: boolean;
};

// Bisnis stok-lite (mis. Adi's Culinary, stock_locations_enabled tanpa
// cost_control_enabled) punya lokasi setara -- tidak ada konsep
// is_production/is_default_purchase yang berarti apa-apa di sana (semua
// false, lihat migration seed). Kalau tetap lewat logic "full" di bawah,
// tiap lokasi dapat 0 item (bukan is_production/is_default_purchase) alias
// checklist-nya kosong. Mode "simple" generate grup rata per lokasi, key-nya
// HARUS SAMA PERSIS dengan buildSimpleLocationNavGroups di dashboard-shell.tsx.
function buildSimpleLocationPermissionGroups(locations: LocationForPermissions[]): PermissionGroup[] {
  // Dulu akses "Permintaan Barang" per lokasi dikontrol lewat 1 key GLOBAL
  // "purchase-requests" yang dipakai bareng di semua grup lokasi sekaligus
  // (bug: centang 1 kotak itu otomatis membuka grup "Permintaan Barang" di
  // SEMUA lokasi -- Gudang Utama, Kitchen, Dapur Produksi, Bar -- bukan cuma
  // yang dimaksud, laporan user 2026-09-03). Sekarang per-lokasi seperti
  // item lain di sini -- key-nya HARUS SAMA PERSIS dengan
  // buildSimpleLocationNavGroups di dashboard-shell.tsx.
  return locations.map((loc) => ({
    title: `Lokasi — ${loc.name}`,
    items: [
      { key: `lokasi-${loc.id}-bahan-baku`, label: `Bahan Baku — ${loc.name}` },
      ...(departmentForLocationName(loc.name)
        ? [{ key: `lokasi-${loc.id}-produk`, label: `Data Produk — ${loc.name}` }]
        : []),
      { key: `lokasi-${loc.id}-purchase-requests`, label: `Permintaan Barang — ${loc.name}` },
      { key: `lokasi-${loc.id}-kartu-stok`, label: `Kartu Stok — ${loc.name}` },
      { key: `lokasi-${loc.id}-stock-opname`, label: `Stok Opname — ${loc.name}` },
      { key: `lokasi-${loc.id}-semi-finished-items`, label: `Bahan Setengah Jadi — ${loc.name}` },
    ],
  }));
}

export function buildLocationPermissionGroups(
  locations: LocationForPermissions[],
  mode: "full" | "simple" = "full",
): PermissionGroup[] {
  if (mode === "simple") {
    return buildSimpleLocationPermissionGroups(locations);
  }
  return locations
    .filter((loc) => loc.isProduction || loc.isDefaultPurchase)
    .map((loc) => {
      const title = loc.isDefaultPurchase ? "Purchasing" : loc.name;
      const items: { key: string; label: string }[] = [
        { key: `lokasi-${loc.id}-bahan-baku`, label: `Bahan Baku — ${title}` },
        { key: `lokasi-${loc.id}-stock-opname`, label: `Stok Opname — ${title}` },
        { key: `lokasi-${loc.id}-kartu-stok`, label: `Kartu Stok — ${title}` },
      ];

      if (loc.isProduction) {
        items.push(
          { key: `lokasi-${loc.id}-semi-finished`, label: `Bahan Setengah Jadi — ${title}` },
          { key: `lokasi-${loc.id}-transfer`, label: `Transfer Internal — ${title}` },
          { key: `lokasi-${loc.id}-permintaan-barang`, label: `Permintaan Barang — ${title}` },
          { key: `lokasi-${loc.id}-purchase-orders`, label: `Purchase Order — ${title}` },
          { key: `lokasi-${loc.id}-biaya`, label: `Biaya Operasional — ${title}` },
        );
      } else {
        items.push({ key: `lokasi-${loc.id}-dokumen-manual`, label: `Dokumen Manual — ${title}` });
      }

      return { title: `Lokasi — ${title}`, items };
    })
    .concat([
      {
        title: "Staf per Lokasi",
        items: locations.map((loc) => ({
          key: `lokasi-${loc.id}-staf`,
          label: `Staf — ${loc.isDefaultPurchase ? "Purchasing" : loc.name}`,
        })),
      },
    ].filter((g) => g.items.length > 0));
}
