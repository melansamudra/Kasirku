"use client";

import { useState, useTransition } from "react";
import { Capacitor } from "@capacitor/core";
import { sendTransactionToLinkedStore } from "./send-to-store-actions";

export default function SendToStoreToggle({
  businessId,
  transactionId,
  alreadySent: initialSent,
}: {
  businessId: string;
  transactionId: string;
  alreadySent: boolean;
}) {
  const [sent, setSent] = useState(initialSent);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (Capacitor.isNativePlatform()) return null;

  if (sent) {
    return (
      <div
        className="flex items-center border-l border-zinc-100 px-3"
        title="Sudah dikirim ke toko lain"
      >
        <span className="text-base leading-none text-brand-600">🔒</span>
      </div>
    );
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Beda dari MirrorToggle (visibility) -- ini beneran bikin transaksi baru
    // di toko lain (potong stok + jurnal), jadi wajib konfirmasi eksplisit
    // window.confirm(), bukan langsung jalan begitu diklik.
    if (
      !window.confirm(
        "Kirim transaksi ini sebagai transaksi baru di toko tujuan (stok & jurnal toko tujuan ikut terpakai)? Tidak bisa dibatalkan lewat toggle ini -- kalau salah, batalkan lewat void transaksi.",
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await sendTransactionToLinkedStore(businessId, transactionId);
      if (result.error) setError(result.error);
      else setSent(true);
    });
  }

  return (
    <div className="flex items-center gap-2 border-l border-zinc-100 px-3">
      {error && (
        <p className="max-w-[140px] text-right text-[10px] font-medium text-red-500">{error}</p>
      )}
      <button
        onClick={handleClick}
        disabled={pending}
        title="Kirim ke Toko Lain"
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-zinc-300 transition-colors disabled:opacity-50"
      >
        <span className="inline-block h-4 w-4 translate-x-1 transform rounded-full bg-white shadow transition-transform" />
      </button>
    </div>
  );
}
