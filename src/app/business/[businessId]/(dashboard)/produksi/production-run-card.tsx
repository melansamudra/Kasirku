"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { voidProductionRun } from "./actions";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function ProductionRunCard({
  businessId,
  run,
}: {
  businessId: string;
  run: {
    id: string;
    item_name: string;
    qty_produced: number;
    unit: string;
    total_cost: number;
    produced_by_name: string;
    note: string | null;
    voided: boolean;
    void_reason: string | null;
    status: string;
    reject_reason: string | null;
    produced_at: string;
  };
}) {
  const router = useRouter();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rejected = run.status === "rejected";

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${run.voided || rejected ? "border-zinc-200 bg-zinc-50 opacity-60" : "border-zinc-200 bg-white"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            {run.item_name} — {run.qty_produced} {run.unit}
          </p>
          <p className="text-xs text-zinc-500">
            {new Date(run.produced_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
            {" · "}
            {run.produced_by_name}
            {run.note && ` · ${run.note}`}
          </p>
          {run.voided && (
            <p className="mt-0.5 text-xs font-medium text-red-500">Dibatalkan: {run.void_reason}</p>
          )}
          {rejected && (
            <p className="mt-0.5 text-xs font-medium text-red-500">
              Ditolak (hasil scan): {run.reject_reason}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-sm font-semibold text-zinc-700">{formatRupiah(run.total_cost)}</p>
          {!run.voided && !rejected && !voiding && (
            <button
              onClick={() => setVoiding(true)}
              className="text-xs text-zinc-400 hover:text-red-500"
              title="Batalkan produksi ini"
            >
              Batalkan
            </button>
          )}
        </div>
      </div>

      {voiding && (
        <div className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan pembatalan (wajib)"
            className="w-full rounded-lg border border-red-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-200"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setPending(true);
                setError(null);
                const result = await voidProductionRun(businessId, run.id, reason);
                setPending(false);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              }}
              disabled={pending}
              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Membatalkan…" : "Ya, Batalkan"}
            </button>
            <button
              onClick={() => {
                setVoiding(false);
                setError(null);
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
