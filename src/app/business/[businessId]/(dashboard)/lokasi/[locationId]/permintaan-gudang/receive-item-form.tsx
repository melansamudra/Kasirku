"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "./actions";

export default function ReceiveItemForm({
  dnItemId,
  ingredientNames,
  ingredientByName,
  employees,
  action,
}: {
  dnItemId: string;
  ingredientNames: string[];
  ingredientByName: Map<string, { id: string; unit: string }>;
  employees: { id: string; name: string }[];
  action: (ingredientId: string, qty: number, receivedBy: string) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ingredientName, setIngredientName] = useState("");
  const [qty, setQty] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-medium text-brand-600 hover:underline">
        Tambahkan ke Stok
      </button>
    );
  }

  const matched = ingredientByName.get(ingredientName.trim().toLowerCase());

  async function handleSubmit() {
    setError(null);
    const match = ingredientByName.get(ingredientName.trim().toLowerCase());
    if (!match) {
      setError("Pilih nama bahan baku yang cocok dari daftar (ketik lalu pilih dari saran).");
      return;
    }
    if (!qty || Number(qty) <= 0) {
      setError("Qty harus lebih dari 0.");
      return;
    }
    if (!receivedBy) {
      setError("Pilih nama penerima dulu.");
      return;
    }
    setSubmitting(true);
    const result = await action(match.id, Number(qty), receivedBy);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2">
      <datalist id={`ingredient-names-${dnItemId}`}>
        {ingredientNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-1.5">
        <input
          type="text"
          list={`ingredient-names-${dnItemId}`}
          placeholder="Cari bahan baku…"
          value={ingredientName}
          onChange={(e) => setIngredientName(e.target.value)}
          className="min-w-[140px] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
        />
        <input
          type="number"
          min="0"
          step="any"
          placeholder={matched ? `Qty (${matched.unit})` : "Qty"}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
        />
        <select
          value={receivedBy}
          onChange={(e) => setReceivedBy(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
        >
          <option value="">— Diterima oleh —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.name}>
              {e.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "…" : "Simpan"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-zinc-400 hover:text-zinc-600">
          Batal
        </button>
      </div>
      {error && <p className="mt-1 text-[10.5px] text-red-600">{error}</p>}
    </div>
  );
}
