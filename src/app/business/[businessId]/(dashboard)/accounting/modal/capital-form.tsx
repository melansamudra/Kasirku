"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CapitalDirection, CapitalMovementState } from "./actions";

export default function CapitalForm({
  action,
  today,
}: {
  action: (
    direction: CapitalDirection,
    state: CapitalMovementState,
    formData: FormData,
  ) => Promise<CapitalMovementState>;
  today: string;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<CapitalDirection>("setoran");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("date", date);
    formData.set("amount", amount);
    formData.set("description", description);
    const result = await action(direction, { error: null }, formData);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setAmount("");
    setDescription("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDirection("setoran")}
          className={`rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
            direction === "setoran"
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-zinc-200 bg-white text-zinc-600"
          }`}
        >
          + Setoran Modal
        </button>
        <button
          type="button"
          onClick={() => setDirection("prive")}
          className={`rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
            direction === "prive"
              ? "border-red-400 bg-red-50 text-red-700"
              : "border-zinc-200 bg-white text-zinc-600"
          }`}
        >
          − Ambil Prive
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Tanggal</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Nominal (Rp)</label>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="1000000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Keterangan</label>
        <input
          type="text"
          placeholder={direction === "setoran" ? "mis. Tambahan modal awal" : "mis. Kebutuhan pribadi"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : direction === "setoran" ? "+ Catat Setoran Modal" : "− Catat Prive"}
      </button>
    </div>
  );
}
