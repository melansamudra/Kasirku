"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ExpenseState } from "../../../finance/actions";

const initialState: ExpenseState = { error: null };

// Sama persis dengan OTHER_CATEGORIES di finance/add-expense-form.tsx --
// harus tetap sinkron karena keduanya dipetakan ke akun beban yang sama
// (EXPENSE_CATEGORY_ACCOUNT di finance/actions.ts). Kategori pembelian
// (Bahan Baku/Barang Dagang) sengaja tidak dimasukkan di sini -- itu
// tetap lewat Pembelian & Hutang, bukan biaya operasional lokasi.
const CATEGORIES = [
  "Listrik & Air",
  "Gas LPG",
  "Gaji & Upah",
  "Sewa",
  "Konsumsi",
  "Perlengkapan",
  "Lain-lain",
];

export default function AddLocationExpenseForm({
  action,
  today,
  locationId,
}: {
  action: (state: ExpenseState, formData: FormData) => Promise<ExpenseState>;
  today: string;
  locationId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="locationId" value={locationId} />
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="date" className="mb-1 block text-xs font-medium text-zinc-600">
            Tanggal
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={today}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-xs font-medium text-zinc-600">
            Kategori
          </label>
          <select
            id="category"
            name="category"
            defaultValue={CATEGORIES[0]}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="amount" className="mb-1 block text-xs font-medium text-zinc-600">
            Jumlah (Rp)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="1"
            placeholder="500000"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="note" className="mb-1 block text-xs font-medium text-zinc-600">
            Catatan (opsional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            placeholder="mis. tagihan Agustus"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah Biaya"}
      </button>
    </form>
  );
}
