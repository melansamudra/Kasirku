"use client";

import { useState, useTransition } from "react";
import { saveTransactionSelections } from "../actions";

type Transaction = {
  id: string;
  invoice_number: string;
  date: string;
  total: number;
  cashier_name: string | null;
};

function formatRupiah(v: number) {
  return `Rp${v.toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SelectTransactionsForm({
  businessId,
  mirrorAccountId,
  transactions,
  initialSelected,
}: {
  businessId: string;
  mirrorAccountId: string;
  transactions: Transaction[];
  initialSelected: Set<string>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSaved(false);
    setSelected(new Set(transactions.map((t) => t.id)));
  }

  function clearAll() {
    setSaved(false);
    setSelected(new Set());
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    const formData = new FormData();
    selected.forEach((id) => formData.append("tx_id", id));
    startTransition(async () => {
      const result = await saveTransactionSelections(businessId, mirrorAccountId, formData);
      if (result?.error) {
        setSaveError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Pilih Semua
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Hapus Semua
          </button>
        </div>
        <p className="text-xs text-zinc-400">{selected.size} dipilih</p>
      </div>

      {/* Daftar transaksi */}
      <div className="space-y-1.5">
        {transactions.map((t) => {
          const checked = selected.has(t.id);
          return (
            <label
              key={t.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                checked
                  ? "border-brand-300 bg-brand-50"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(t.id)}
                className="mt-0.5 accent-brand-600"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-900">{t.invoice_number}</p>
                  <p className="shrink-0 text-xs font-semibold text-zinc-700">
                    {formatRupiah(t.total)}
                  </p>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
                  <span>{formatDate(t.date)}</span>
                  {t.cashier_name && <span>· {t.cashier_name}</span>}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Tombol simpan */}
      <div className="sticky bottom-4 mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {isPending ? "Menyimpan…" : "Simpan Pilihan"}
        </button>
        {saved && !isPending && (
          <span className="text-xs font-medium text-green-600">✓ Tersimpan</span>
        )}
        {saveError && !isPending && (
          <span className="text-xs font-medium text-red-600">{saveError}</span>
        )}
      </div>
    </form>
  );
}
