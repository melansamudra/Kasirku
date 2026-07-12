"use client";

import { useState, useTransition } from "react";
import { createPayment } from "./actions";

export default function PayButton({
  businessId,
  planCode,
}: {
  businessId: string;
  planCode: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createPayment(businessId, planCode);
      if (result.error || !result.redirectUrl) {
        setError(result.error ?? "Gagal membuat transaksi pembayaran.");
        return;
      }
      window.location.href = result.redirectUrl;
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyiapkan pembayaran…" : "Bayar Sekarang"}
      </button>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
