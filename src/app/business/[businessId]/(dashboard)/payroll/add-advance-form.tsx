"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddAdvanceForm({
  today,
  action,
}: {
  today: string;
  action: (date: string, amount: number, note: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 text-xs font-medium text-amber-600 hover:underline"
      >
        + Kasbon
      </button>
    );
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const result = await action(date, Number(amount), note);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setAmount("");
    setNote("");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <input
          type="number"
          min="0"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Nominal (Rp)"
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Catatan (opsional)"
        className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={pending}
          className="flex-1 rounded-lg bg-amber-600 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Catat Kasbon"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
