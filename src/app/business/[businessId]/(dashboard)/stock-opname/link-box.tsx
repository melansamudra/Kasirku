"use client";

import { useState } from "react";
import { regenerateIngredientOpnameSlug } from "./actions";

export default function StockOpnameLinkBox({
  businessId,
  initialSlug,
}: {
  businessId: string;
  initialSlug: string;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const url = slug && typeof window !== "undefined" ? `${window.location.origin}/bahan-opname/${slug}` : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleGenerate() {
    setError(null);
    setPending(true);
    const result = await regenerateIngredientOpnameSlug(businessId);
    setPending(false);
    setConfirmRegen(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.slug) setSlug(result.slug);
  }

  if (!slug) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-brand-200 bg-brand-50 px-4 py-3">
        <p className="text-xs font-semibold text-brand-800">Link Publik untuk Staf</p>
        <p className="mt-0.5 text-[11px] text-brand-700">
          Belum ada link. Buat satu supaya staf bisa isi hasil hitung fisik sendiri (tanpa login) — hasilnya
          tetap masuk sebagai &quot;pending&quot;, menunggu diverifikasi di halaman ini.
        </p>
        <button
          onClick={handleGenerate}
          disabled={pending}
          className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Membuat…" : "Buat Link"}
        </button>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-brand-200 bg-brand-50 px-4 py-3">
      <p className="text-xs font-semibold text-brand-800">Link Publik untuk Staf</p>
      <p className="mt-0.5 text-[11px] text-brand-700">
        Bagikan link ini ke staf supaya bisa isi hasil hitung fisik sendiri (tanpa login) — hasilnya tetap
        masuk sebagai &quot;pending&quot;, menunggu diverifikasi di halaman ini.
      </p>
      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-white bg-white px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-600">{url}</p>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          {copied ? "✓ Tersalin" : "Salin Link"}
        </button>
      </div>
      <div className="mt-2">
        {confirmRegen ? (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-zinc-500">Link lama langsung tidak berfungsi. Yakin?</span>
            <button
              onClick={handleGenerate}
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
            className="text-[11px] font-medium text-brand-700/70 hover:text-red-600"
          >
            Ganti link (kalau bocor ke luar tim)
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
