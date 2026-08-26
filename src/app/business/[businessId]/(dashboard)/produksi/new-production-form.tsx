"use client";

import { useActionState, useRef, useEffect, useState, useMemo } from "react";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

type RecipeLine = { name: string; qtyPerUnit: number; unit: string; availableStock: number };

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

export default function NewProductionForm({
  action,
  items,
  employees,
  recipesByItem,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  items: { id: string; name: string; unit: string; stock: number }[];
  employees: { id: string; name: string }[];
  recipesByItem: Record<string, RecipeLine[]>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [qtyProduced, setQtyProduced] = useState("");

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  // Reset field terkontrol (select/qty) begitu submit selesai sukses —
  // disesuaikan saat render (bukan di effect terpisah) supaya tidak
  // menabrak aturan "jangan setState langsung di body effect", sama pola
  // dengan penyesuaian openGroup di dashboard-shell.tsx.
  const [wasPending, setWasPending] = useState(pending);
  if (wasPending !== pending) {
    setWasPending(pending);
    if (wasPending && !pending && !state.error) {
      setSelectedItemId("");
      setQtyProduced("");
    }
  }

  const qtyNum = Number(qtyProduced) || 0;
  const preview = useMemo(
    () => (recipesByItem[selectedItemId] ?? []).map((line) => ({ ...line, needed: line.qtyPerUnit * qtyNum })),
    [recipesByItem, selectedItemId, qtyNum],
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="semiFinishedItemId" className="mb-1 block text-xs font-medium text-zinc-600">
          Bahan Setengah Jadi
        </label>
        <select
          id="semiFinishedItemId"
          name="semiFinishedItemId"
          required
          value={selectedItemId}
          onChange={(e) => setSelectedItemId(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Pilih item…</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} (stok {item.stock} {item.unit})
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="qtyProduced" className="mb-1 block text-xs font-medium text-zinc-600">
            Jumlah Diproduksi
          </label>
          <input
            id="qtyProduced"
            name="qtyProduced"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={qtyProduced}
            onChange={(e) => setQtyProduced(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="employeeId" className="mb-1 block text-xs font-medium text-zinc-600">
            Tim Produksi (opsional)
          </label>
          <select
            id="employeeId"
            name="employeeId"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {selectedItemId && (
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
            Bahan yang akan terpakai
          </p>
          {preview.length === 0 ? (
            <p className="text-xs text-zinc-400">Item ini belum punya resep — atur dulu di halaman detailnya.</p>
          ) : (
            <div className="space-y-1">
              {preview.map((line) => {
                const insufficient = qtyNum > 0 && line.needed > line.availableStock + 1e-9;
                return (
                  <div key={line.name} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-600">{line.name}</span>
                    <span className={insufficient ? "font-semibold text-red-600" : "text-zinc-700"}>
                      {formatQty(line.needed)} {line.unit}
                      <span className="text-zinc-400"> / stok {formatQty(line.availableStock)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor="note" className="mb-1 block text-xs font-medium text-zinc-600">
          Catatan (opsional)
        </label>
        <input
          id="note"
          name="note"
          type="text"
          placeholder="mis. batch pagi"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Catat Produksi & Tambah Stok"}
      </button>
    </form>
  );
}
