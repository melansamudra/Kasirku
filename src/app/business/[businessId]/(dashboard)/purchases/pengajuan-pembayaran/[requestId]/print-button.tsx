"use client";

import { useState } from "react";
import Link from "next/link";
import { buildPaymentRequestWaText } from "../wa-actions";

export default function PrintButton({ businessId, requestId }: { businessId: string; requestId: string }) {
  const [waLoading, setWaLoading] = useState(false);

  async function handleSendWA() {
    setWaLoading(true);
    try {
      const text = await buildPaymentRequestWaText(businessId, requestId);
      if (!text) return;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    } finally {
      setWaLoading(false);
    }
  }

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex gap-2">
        <Link
          href={`/business/${businessId}/purchases/pengajuan-pembayaran`}
          className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          ← Kembali
        </Link>
        <button
          onClick={() => window.print()}
          className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          🖨️ Cetak PDF
        </button>
      </div>
      <button
        onClick={handleSendWA}
        disabled={waLoading}
        className="block w-full rounded-xl border border-green-200 py-2.5 text-sm font-semibold text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50"
      >
        {waLoading ? "Menyiapkan…" : "💬 Kirim ke Owner via WhatsApp"}
      </button>
    </div>
  );
}
