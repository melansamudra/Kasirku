"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  saveMirrorLink,
  deactivateMirrorLink,
  saveMirrorProductMapping,
} from "./mirror-store-actions";

type OtherBusiness = { id: string; name: string };
type Cashier = { id: string; business_id: string; name: string };
type Product = { id: string; name: string };
type ActiveLink = { id: string; to_business_id: string; to_cashier_id: string } | null;

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export default function MirrorStoreSection({
  businessId,
  otherBusinesses,
  cashiersByBusiness,
  activeLink,
  ownProducts,
  destProducts,
  mappings,
}: {
  businessId: string;
  otherBusinesses: OtherBusiness[];
  cashiersByBusiness: Record<string, Cashier[]>;
  activeLink: ActiveLink;
  ownProducts: Product[];
  destProducts: Product[];
  mappings: { from_product_id: string; to_product_id: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedBusinessId, setSelectedBusinessId] = useState(activeLink?.to_business_id ?? "");
  const [selectedCashierId, setSelectedCashierId] = useState(activeLink?.to_cashier_id ?? "");

  const mappingByProduct = new Map(mappings.map((m) => [m.from_product_id, m.to_product_id]));
  const destByNormalizedName = new Map(destProducts.map((p) => [normalizeName(p.name), p.id]));

  function handleSaveLink() {
    setError(null);
    startTransition(async () => {
      const result = await saveMirrorLink(businessId, selectedBusinessId, selectedCashierId);
      if (result.error) setError(result.error);
    });
  }

  function handleDeactivate() {
    if (!activeLink) return;
    if (!window.confirm("Putuskan hubungan mirror ke toko ini? Toggle \"Kirim ke Toko Lain\" akan hilang dari daftar transaksi.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deactivateMirrorLink(businessId, activeLink.id);
      if (result.error) setError(result.error);
      else {
        setSelectedBusinessId("");
        setSelectedCashierId("");
      }
    });
  }

  function handleMappingChange(fromProductId: string, toProductId: string) {
    if (!activeLink) return;
    startTransition(async () => {
      const result = await saveMirrorProductMapping(businessId, activeLink.id, fromProductId, toProductId);
      if (result.error) setError(result.error);
    });
  }

  // Auto-terapkan saran pencocokan nama produk sekali saat halaman dibuka —
  // supaya tabel transaction_mirror_product_map betulan berisi baris nyata
  // (bukan cuma keliatan "sudah dipilih" di select tapi belum tersimpan,
  // yang bisa bikin RPC pengiriman gagal padahal UI-nya kelihatan lengkap).
  // Owner tetap bisa koreksi manual kapan saja lewat select di bawah.
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (!activeLink || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    for (const p of ownProducts) {
      if (mappingByProduct.has(p.id)) continue;
      const suggested = destByNormalizedName.get(normalizeName(p.name));
      if (suggested) handleMappingChange(p.id, suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLink?.id]);

  const destBusinessName = otherBusinesses.find((b) => b.id === activeLink?.to_business_id)?.name;
  const cashierOptions = cashiersByBusiness[selectedBusinessId] ?? [];
  const mappedCount = ownProducts.filter((p) => mappingByProduct.has(p.id)).length;

  return (
    <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Kirim Transaksi ke Toko Lain</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Kalau dinyalakan per transaksi (toggle di halaman Riwayat Transaksi), transaksi itu akan
        dibuat ULANG sebagai transaksi penuh di toko tujuan — stok &amp; jurnal toko tujuan ikut
        terpotong/tercatat sendiri. Hanya bisa ke toko lain yang dimiliki akun pemilik yang sama.
      </p>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {otherBusinesses.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
          Belum ada toko lain di akun ini untuk dijadikan tujuan mirror.
        </p>
      ) : (
        <>
          {activeLink && destBusinessName && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
              <p className="text-xs font-medium text-brand-800">
                Terhubung ke <span className="font-semibold">{destBusinessName}</span>
              </p>
              <button
                onClick={handleDeactivate}
                disabled={pending}
                className="text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50"
              >
                Putuskan
              </button>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <select
              value={selectedBusinessId}
              onChange={(e) => {
                setSelectedBusinessId(e.target.value);
                setSelectedCashierId("");
              }}
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
            >
              <option value="">Pilih toko tujuan…</option>
              {otherBusinesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {selectedBusinessId && (
              <select
                value={selectedCashierId}
                onChange={(e) => setSelectedCashierId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
              >
                <option value="">Pilih kasir tujuan…</option>
                {cashierOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handleSaveLink}
              disabled={pending || !selectedBusinessId || !selectedCashierId}
              className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {activeLink ? "Ganti Toko/Kasir Tujuan" : "Hubungkan"}
            </button>
          </div>
        </>
      )}

      {activeLink && (
        <div className="mt-6 border-t border-zinc-100 pt-4">
          <h3 className="text-xs font-semibold text-zinc-700">
            Pemetaan Produk ({mappedCount}/{ownProducts.length} sudah dipetakan)
          </h3>
          <p className="text-[11px] text-zinc-400">
            Produk yang belum dipetakan akan menggagalkan pengiriman transaksi yang memuatnya.
          </p>
          <div className="mt-2 space-y-1.5">
            {ownProducts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-center text-xs text-zinc-400">
                Belum ada produk di toko ini.
              </p>
            ) : (
              ownProducts.map((p) => {
                const suggested = destByNormalizedName.get(normalizeName(p.name));
                const currentValue = mappingByProduct.get(p.id) ?? suggested ?? "";
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <p className="w-1/2 truncate text-xs text-zinc-700" title={p.name}>
                      {p.name}
                    </p>
                    <select
                      value={currentValue}
                      onChange={(e) => handleMappingChange(p.id, e.target.value)}
                      className={`w-1/2 rounded-lg border px-2 py-1 text-xs focus:border-brand-600 focus:outline-none ${
                        currentValue ? "border-zinc-200" : "border-red-200 bg-red-50"
                      }`}
                    >
                      <option value="">— belum dipetakan —</option>
                      {destProducts.map((dp) => (
                        <option key={dp.id} value={dp.id}>
                          {dp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
