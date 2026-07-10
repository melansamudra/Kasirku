"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdjustmentType } from "../actions";

export default function AddAdjustmentForm({
  action,
}: {
  action: (type: AdjustmentType, label: string, amount: number) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [type, setType] = useState<AdjustmentType>("tunjangan");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const result = await action(type, label, Number(amount));
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setLabel("");
    setAmount("");
    router.refresh();
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setType("tunjangan")}
          className={`rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
            type === "tunjangan"
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-zinc-200 bg-white text-zinc-600"
          }`}
        >
          + Tunjangan
        </button>
        <button
          type="button"
          onClick={() => setType("potongan")}
          className={`rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
            type === "potongan"
              ? "border-red-400 bg-red-50 text-red-700"
              : "border-zinc-200 bg-white text-zinc-600"
          }`}
        >
          − Potongan
        </button>
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={type === "tunjangan" ? "mis. Bonus, Uang Makan" : "mis. Kasbon, Telat"}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <input
        type="number"
        min="0"
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Nominal (Rp)"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Tambah"}
      </button>
    </div>
  );
}
