"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closePettyCash, type PettyCashClosureSummary } from "./actions";
import PrintClosureButton from "./print-closure-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

type ExistingClosure = {
  id: string;
  totalAllocated: number;
  totalTunai: number;
  totalHutang: number;
  hutangCount: number;
  expectedRemaining: number;
  actualRemaining: number;
  difference: number;
};

function ClosureSummaryCard({
  businessId,
  closure,
}: {
  businessId: string;
  closure: ExistingClosure;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-900">🔒 Petty Cash Sudah Ditutup</p>
        <PrintClosureButton businessId={businessId} closureId={closure.id} />
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-zinc-500">Petty Cash Diberikan</span>
          <span className="font-medium text-zinc-900">{formatRupiah(closure.totalAllocated)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Nota Tunai</span>
          <span className="font-medium text-red-600">-{formatRupiah(closure.totalTunai)}</span>
        </div>
        <div className="flex justify-between border-t border-zinc-100 pt-1.5 font-semibold">
          <span className="text-zinc-700">Sisa Seharusnya</span>
          <span className="text-zinc-900">{formatRupiah(closure.expectedRemaining)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Sisa Fisik Dihitung</span>
          <span className="font-medium text-zinc-900">{formatRupiah(closure.actualRemaining)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Selisih</span>
          <span
            className={`font-semibold ${
              closure.difference === 0
                ? "text-zinc-700"
                : closure.difference > 0
                  ? "text-brand-700"
                  : "text-red-600"
            }`}
          >
            {closure.difference === 0 ? "Pas" : `${closure.difference > 0 ? "+" : ""}${formatRupiah(closure.difference)}`}
          </span>
        </div>
        <div className="flex justify-between border-t border-zinc-100 pt-1.5">
          <span className="text-zinc-500">Nota Hutang</span>
          <span className="font-medium text-zinc-900">
            {closure.hutangCount} nota · {formatRupiah(closure.totalHutang)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ClosePettyCashForm({
  businessId,
  date,
  existingClosure,
}: {
  businessId: string;
  date: string;
  existingClosure: ExistingClosure | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actualRemaining, setActualRemaining] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PettyCashClosureSummary | null>(null);

  const closure = existingClosure ?? summary;
  if (closure) {
    return <ClosureSummaryCard businessId={businessId} closure={closure} />;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 transition-colors hover:border-brand-400 hover:text-brand-600"
      >
        🔒 Tutup Petty Cash Hari Ini
      </button>
    );
  }

  function handleSubmit() {
    setError(null);

    const amount = Number(actualRemaining);
    if (!actualRemaining || Number.isNaN(amount) || amount < 0) {
      setError("Sisa kas fisik harus angka dan tidak boleh negatif.");
      return;
    }

    setPending(true);
    closePettyCash(businessId, date, amount, notes.trim() || null).then((res) => {
      setPending(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSummary(res.summary);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Tutup Petty Cash Hari Ini</h3>
      <p className="mt-0.5 mb-3 text-xs text-zinc-500">
        Hitung uang petty cash fisik yang tersisa sekarang, lalu masukkan totalnya. Setelah
        ditutup, tanggal ini tidak bisa ditutup ulang.
      </p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Sisa Kas Fisik Dihitung (Rp)</label>
          <input
            type="number"
            min="0"
            value={actualRemaining}
            onChange={(e) => setActualRemaining(e.target.value)}
            placeholder="mis. 626000"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Menutup…" : "Tutup Petty Cash"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-500 hover:bg-zinc-50"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
