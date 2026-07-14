"use client";

import { useState, useTransition } from "react";
import { createDesktopOrder } from "./actions";

export default function BuyForm({ productCode }: { productCode: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createDesktopOrder(email, productCode);
      if (result.error || !result.redirectUrl) {
        setError(result.error ?? "Gagal membuat transaksi pembayaran.");
        return;
      }
      window.location.href = result.redirectUrl;
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email kamu (link download dikirim ke sini)"
        className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyiapkan pembayaran…" : "Beli Sekarang"}
      </button>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}
