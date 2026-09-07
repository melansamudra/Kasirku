"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBulkPaymentRequest } from "../pengajuan-pembayaran/actions";

const AGING_COLOR: Record<string, string> = {
  "0-30 hari": "bg-zinc-100 text-zinc-500",
  "31-60 hari": "bg-amber-50 text-amber-700",
  "61-90 hari": "bg-orange-50 text-orange-700",
  "90+ hari": "bg-red-50 text-red-700",
};

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}
function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Row = {
  id: string;
  date: string;
  dueDate: string | null;
  label: string;
  amount: number;
  sisa: number;
  bucket: string;
  pendingRequestId: string | null;
  pendingAmount: number | null;
};
type SupplierGroup = {
  supplierId: string;
  supplierName: string;
  rows: Row[];
  totalSisa: number;
};

export default function DebtSelectionList({
  businessId,
  supplierGroups,
}: {
  businessId: string;
  supplierGroups: SupplierGroup[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"tunai" | "transfer">("transfer");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const allRows = supplierGroups.flatMap((g) => g.rows);
  const selectableRows = allRows.filter((r) => !r.pendingRequestId);
  const selectedRows = selectableRows.filter((r) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((s, r) => s + r.sisa, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllInSupplier(rows: Row[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (r.pendingRequestId) continue;
        if (checked) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const result = await createBulkPaymentRequest(businessId, [...selected], paymentMethod, note || null);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.requestId) {
      router.push(`/business/${businessId}/purchases/pengajuan-pembayaran/${result.requestId}`);
    }
  }

  return (
    <div className="pb-24">
      <div className="space-y-4">
        {supplierGroups.map((g) => {
          const selectableInGroup = g.rows.filter((r) => !r.pendingRequestId);
          const allSelected = selectableInGroup.length > 0 && selectableInGroup.every((r) => selected.has(r.id));
          return (
            <div
              key={g.supplierId}
              className="overflow-hidden rounded-xl bg-white shadow-sm print:rounded-none print:border print:border-zinc-200 print:shadow-none"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  {selectableInGroup.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAllInSupplier(selectableInGroup, e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 print:hidden"
                      aria-label={`Pilih semua hutang ${g.supplierName}`}
                    />
                  )}
                  <h2 className="text-sm font-bold text-zinc-900">{g.supplierName}</h2>
                </div>
                <p className="text-sm font-bold text-amber-700">{formatRupiah(g.totalSisa)}</p>
              </div>
              <div className="divide-y divide-zinc-100">
                {g.rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      {!r.pendingRequestId && (
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          className="h-4 w-4 shrink-0 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 print:hidden"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-800">{r.label}</p>
                        <p className="text-[10.5px] text-zinc-400">
                          {formatDate(r.date)}
                          {r.dueDate ? ` · Jatuh tempo ${formatDate(r.dueDate)}` : ""} · Total {formatRupiah(r.amount)}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${AGING_COLOR[r.bucket]}`}>
                      {r.bucket}
                    </span>
                    <p className="shrink-0 text-sm font-bold text-amber-700">{formatRupiah(r.sisa)}</p>
                    {r.pendingRequestId && (
                      <Link
                        href={`/business/${businessId}/purchases/pengajuan-pembayaran/${r.pendingRequestId}`}
                        className="shrink-0 basis-full rounded-lg bg-amber-50 px-2.5 py-1.5 text-center text-xs font-semibold text-amber-700 hover:bg-amber-100 sm:basis-auto"
                      >
                        ⏳ Diajukan {formatRupiah(r.pendingAmount ?? 0)}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 print:hidden">
          <div className="rounded-2xl border border-brand-200 bg-white p-4 shadow-lg">
            {!showForm ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-zinc-900">{selected.size} hutang dipilih</p>
                  <p className="text-xs text-zinc-500">Total {formatRupiah(selectedTotal)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelected(new Set())}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700"
                  >
                    Batal Pilih
                  </button>
                  <button
                    onClick={() => setShowForm(true)}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    Ajukan Pembayaran →
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-sm font-bold text-zinc-900">
                  Ajukan {selected.size} hutang · Total {formatRupiah(selectedTotal)}
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Metode Bayar</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("tunai")}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                        paymentMethod === "tunai" ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      💵 Tunai
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("transfer")}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                        paymentMethod === "transfer" ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      🏦 Transfer
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
                  />
                </div>
                {error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleSubmit}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? "Mengajukan…" : "Ajukan ke Owner"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setError(null);
                    }}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
