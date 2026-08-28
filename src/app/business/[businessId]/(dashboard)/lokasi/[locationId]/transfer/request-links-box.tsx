"use client";

import { useState } from "react";
import Link from "next/link";
import { regenerateLocationTransferSlug } from "./actions";

type RequestingLocation = { id: string; name: string };

function CopyRow({
  label,
  url,
  printHref,
}: {
  label: string;
  url: string;
  printHref: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-zinc-700">{label}</p>
        <p className="truncate text-xs text-zinc-500">{url}</p>
      </div>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
      >
        {copied ? "✓ Tersalin" : "Salin Link"}
      </button>
      <Link
        href={printHref}
        target="_blank"
        className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
      >
        🖨️ Cetak QR
      </Link>
    </div>
  );
}

export default function RequestLinksBox({
  businessId,
  locationId,
  initialSlug,
  requestingLocations,
}: {
  businessId: string;
  locationId: string;
  initialSlug: string;
  requestingLocations: RequestingLocation[];
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const base = typeof window !== "undefined" ? window.location.origin : "";

  async function handleRegenerate() {
    setError(null);
    setPending(true);
    const result = await regenerateLocationTransferSlug(businessId, locationId);
    setPending(false);
    setConfirmRegen(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.slug) setSlug(result.slug);
  }

  return (
    <div className="space-y-2">
      {requestingLocations.map((loc) => (
        <CopyRow
          key={loc.id}
          label={`Link ${loc.name}`}
          url={`${base}/transfer-internal/${slug}?lokasi=${loc.id}`}
          printHref={`/business/${businessId}/lokasi/${locationId}/transfer/print-qr?lokasi=${loc.id}`}
        />
      ))}
      <p className="text-[11px] text-zinc-400">
        Bagikan link masing-masing ke staf lokasi itu — mereka isi bahan yang mau diminta, Anda
        tinggal proses & kirim di bawah.
      </p>

      <div>
        {confirmRegen ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">Semua link lama langsung tidak berfungsi. Yakin?</span>
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
            Ganti semua link (kalau bocor ke luar tim)
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
