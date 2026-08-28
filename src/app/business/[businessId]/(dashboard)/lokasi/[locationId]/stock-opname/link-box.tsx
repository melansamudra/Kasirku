"use client";

import { useState } from "react";
import { regenerateStockOpnameSlug } from "./actions";

export default function StockOpnameLinkBox({
  businessId,
  locationId,
  initialSlug,
}: {
  businessId: string;
  locationId: string;
  initialSlug: string;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const url =
    typeof window !== "undefined" ? `${window.location.origin}/stok-opname/${slug}?lokasi=produksi` : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    setError(null);
    setPending(true);
    const result = await regenerateStockOpnameSlug(businessId, locationId);
    setPending(false);
    setConfirmRegen(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.slug) setSlug(result.slug);
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
        <p className="min-w-0 flex-1 truncate text-xs text-zinc-600">{url}</p>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          {copied ? "✓ Tersalin" : "Salin Link"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-400">
        Bagikan link ini ke staf tiap hari (mis. print jadi poster/QR, atau kirim lewat grup
        WhatsApp). Staf pilih nama, isi stok fisik bahan yang mereka hitung, kirim — tidak perlu
        login. Bahan yang tidak diisi tidak ikut berubah.
      </p>

      <div className="mt-2">
        {confirmRegen ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">Link lama langsung tidak berfungsi. Yakin?</span>
            <button
              onClick={handleRegenerate}
              disabled={pending}
              className="font-semibold text-red-600 hover:underline disabled:opacity-50"
            >
              {pending ? "Mengganti…" : "Ya, ganti"}
            </button>
            <button onClick={() => setConfirmRegen(false)} className="text-zinc-400 hover:text-zinc-600">
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRegen(true)}
            className="text-[11px] font-medium text-zinc-400 hover:text-red-600"
          >
            Ganti link (kalau bocor ke luar tim)
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
