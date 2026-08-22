import { idbGetPosCache, idbPutPosCache } from "@/lib/offline-db";
import type { PosCatalog } from "@/app/business/[businessId]/pos/actions";

type CachedPosCatalog = PosCatalog & { businessId: string; cachedAt: number };

// Cache instan untuk pembukaan POS berikutnya dalam sesi yang sama — dibaca
// secara sinkron-cepat (IndexedDB, ~puluhan ms) sebelum data segar dari
// server datang, supaya grid produk & keranjang langsung kelihatan alih-alih
// layar kosong menunggu roundtrip jaringan. Lihat pos-screen.tsx.
export async function getCachedPosCatalog(businessId: string): Promise<PosCatalog | null> {
  const cached = await idbGetPosCache<CachedPosCatalog>(businessId).catch(() => undefined);
  if (!cached) return null;
  return {
    products: cached.products,
    openBills: cached.openBills,
    customers: cached.customers,
    customPaymentMethods: cached.customPaymentMethods,
    discountRules: cached.discountRules ?? [],
    // Bisa undefined di cache lama — default false (aman: checkout tetap
    // skip queries printer sampai refreshCatalog pertama selesai).
    hasKitchenPrinters: cached.hasKitchenPrinters ?? false,
    hasReceiptPrinters: cached.hasReceiptPrinters ?? false,
    selfOrderEnabled: cached.selfOrderEnabled ?? true,
    optionGroups: cached.optionGroups ?? [],
  };
}

export async function setCachedPosCatalog(businessId: string, catalog: PosCatalog): Promise<void> {
  await idbPutPosCache<CachedPosCatalog>({
    businessId,
    cachedAt: Date.now(),
    ...catalog,
  }).catch(() => {});
}
