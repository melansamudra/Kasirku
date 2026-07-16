"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function PrintButton({
  businessId,
  transactionId,
}: {
  businessId: string;
  transactionId: string;
}) {
  // Struk dibuka dari POS lewat link baru (target="_blank") khusus untuk
  // dicetak — auto-buka dialog print begitu halaman selesai render, supaya
  // kasir tidak perlu klik "Cetak" lagi secara manual. Guard `printed` biar
  // tidak dobel kepanggil (mis. React StrictMode di dev me-render efek 2x).
  const printed = useRef(false);
  useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    window.print();
  }, []);

  return (
    <div className="flex gap-2">
      <Link
        href={`/business/${businessId}/transactions/${transactionId}`}
        className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
      >
        ← Kembali
      </Link>
      <button
        onClick={() => window.print()}
        className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        🖨️ Cetak
      </button>
    </div>
  );
}
