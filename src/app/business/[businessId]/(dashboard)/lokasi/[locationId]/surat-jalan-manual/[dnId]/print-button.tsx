"use client";

import Link from "next/link";

export default function PrintButton({ businessId, locationId }: { businessId: string; locationId: string }) {
  return (
    <div className="flex gap-2 print:hidden">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/surat-jalan-manual`}
        className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
      >
        ← Kembali
      </Link>
      <button
        onClick={() => window.print()}
        className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        🖨️ Cetak Surat Jalan
      </button>
    </div>
  );
}
