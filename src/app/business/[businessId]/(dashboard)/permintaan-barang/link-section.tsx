"use client";

import { useState } from "react";
import Link from "next/link";
import type { RegenerateSlugState } from "./actions";

export default function PurchaseRequestLinkSection({
  businessId,
  initialSlug,
  regenerateAction,
  lockedLocation,
  hideGeneralLink,
}: {
  businessId: string;
  initialSlug: string;
  regenerateAction: () => Promise<RegenerateSlugState>;
  lockedLocation?: { id: string; name: string } | null;
  hideGeneralLink?: boolean;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [copied, setCopied] = useState(false);
  const [lockedCopied, setLockedCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const url = typeof window !== "undefined" ? `${window.location.origin}/permintaan-barang/${slug}` : "";
  const lockedUrl = url && lockedLocation ? `${url}?lokasi=${lockedLocation.id}` : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyLocked() {
    await navigator.clipboard.writeText(lockedUrl);
    setLockedCopied(true);
    setTimeout(() => setLockedCopied(false), 2000);
  }

  async function handleRegenerate() {
    setError(null);
    setPending(true);
    const result = await regenerateAction();
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
      {!hideGeneralLink && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
            <p className="min-w-0 flex-1 truncate text-xs text-zinc-600">{url}</p>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              {copied ? "✓ Tersalin" : "Salin Link"}
            </button>
            <Link
              href={`/business/${businessId}/permintaan-barang/print-qr`}
              target="_blank"
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              🖨️ Cetak QR
            </Link>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Bagikan link ini ke staf dapur/bar/front (mis. print jadi poster/QR di dekat dapur, atau
            kirim lewat grup WhatsApp). Siapa saja yang punya link ini bisa kirim order — jangan sebar
            ke luar tim.
          </p>
        </>
      )}

      {lockedLocation && (
        <div className={hideGeneralLink ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5" : "mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"}>
          <p className="mb-1.5 text-[11px] font-semibold text-amber-800">
            Link khusus {lockedLocation.name}
          </p>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-amber-700">{lockedUrl}</p>
            <button
              onClick={handleCopyLocked}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:border-amber-400"
            >
              {lockedCopied ? "✓ Tersalin" : "Salin Link"}
            </button>
            <Link
              href={`/business/${businessId}/permintaan-barang/print-qr?lokasi=${lockedLocation.id}`}
              target="_blank"
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:border-amber-400"
            >
              🖨️ Cetak QR
            </Link>
          </div>
          <p className="mt-1.5 text-[10.5px] text-amber-700/80">
            Lokasinya sudah terkunci ke {lockedLocation.name} — staf yang order dari link ini
            tidak perlu (dan tidak bisa) pilih lokasi lain, supaya stoknya selalu kecatat di sini.
          </p>
        </div>
      )}

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
