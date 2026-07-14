"use client";

import { useState, useTransition } from "react";
import { addCashIn, addCashOut } from "./actions";

export default function AddCashForm({ businessId, today }: { businessId: string; today: string }) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const action = direction === "in" ? addCashIn : addCashOut;
      const result = await action(businessId, date, description, Number(amount));
      if (result.error) {
        setError(result.error);
        return;
      }
      setDescription("");
      setAmount("");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setDirection("in")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            direction === "in"
              ? "bg-brand-600 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          ↓ Kas Masuk
        </button>
        <button
          type="button"
          onClick={() => setDirection("out")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            direction === "out"
              ? "bg-red-600 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          ↑ Kas Keluar
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
          <label className="mb-1 block text-xs font-medium text-zinc-600">Jumlah (Rp)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="mis. 50000"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Keterangan</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={direction === "in" ? "mis. Setoran modal tambahan" : "mis. Beli galon & kopi kantor"}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          direction === "in" ? "bg-brand-600 hover:bg-brand-700" : "bg-red-600 hover:bg-red-700"
        }`}
      >
        {pending ? "Menyimpan…" : direction === "in" ? "+ Catat Kas Masuk" : "+ Catat Kas Keluar"}
      </button>
    </div>
  );
}
