"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "./actions";

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

type RecipeLine = { name: string; qtyPerUnit: number; unit: string; availableStock: number };
type ReportedLine = {
  id: string;
  ingredient_id: string | null;
  reported_name: string;
  reported_unit: string;
  qty: number;
};

export default function PendingProductionCard({
  run,
  existingItems,
  existingIngredients,
  standardRecipe,
  reportedLines,
  verifyAction,
  rejectAction,
  linkExistingAction,
  createNewAction,
  linkReportedIngredientAction,
  createIngredientForReportedAction,
}: {
  run: {
    id: string;
    semi_finished_item_id: string | null;
    item_name: string;
    qty_produced: number;
    unit: string;
    produced_by_name: string;
    note: string | null;
    produced_at: string;
  };
  existingItems: { id: string; name: string; unit: string }[];
  existingIngredients: { id: string; name: string; unit: string }[];
  standardRecipe: RecipeLine[];
  reportedLines: ReportedLine[];
  verifyAction: (useReported: boolean) => Promise<ActionState>;
  rejectAction: (reason: string) => Promise<ActionState>;
  linkExistingAction: (existingItemId: string) => Promise<ActionState>;
  createNewAction: () => Promise<ActionState>;
  linkReportedIngredientAction: (reportedRowId: string, existingIngredientId: string) => Promise<ActionState>;
  createIngredientForReportedAction: (reportedRowId: string) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [chosenExistingId, setChosenExistingId] = useState("");
  const [chosenIngredientByRow, setChosenIngredientByRow] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run_(action: () => Promise<ActionState>) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const itemResolved = !!run.semi_finished_item_id;
  const unresolvedReportedLines = reportedLines.filter((l) => !l.ingredient_id);
  const allReportedResolved = reportedLines.length > 0 && unresolvedReportedLines.length === 0;

  const standardPreview = standardRecipe.map((line) => ({ ...line, needed: line.qtyPerUnit * run.qty_produced }));

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            {run.item_name} — {run.qty_produced} {run.unit}
          </p>
          <p className="text-xs text-zinc-500">
            {new Date(run.produced_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
            {" · "}
            {run.produced_by_name}
            {run.note && ` · ${run.note}`}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-amber-700">Hasil scan — belum mengubah stok</p>
        </div>

        {!rejecting && (
          <button
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 hover:border-red-300 hover:text-red-600"
          >
            Tolak
          </button>
        )}
      </div>

      {/* 1) Item belum terhubung ke katalog Bahan Setengah Jadi */}
      {!itemResolved && !rejecting && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-white p-3">
          <p className="text-[11px] font-semibold text-zinc-600">
            &quot;{run.item_name}&quot; belum ada di katalog Bahan Setengah Jadi — arahkan ke mana?
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={chosenExistingId}
              onChange={(e) => setChosenExistingId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">— Ini sebenarnya item lama… —</option>
              {existingItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
            <button
              onClick={() => chosenExistingId && run_(() => linkExistingAction(chosenExistingId))}
              disabled={pending || !chosenExistingId}
              className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Gabung
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-[10px] text-zinc-400">atau</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>
          <button
            onClick={() => run_(createNewAction)}
            disabled={pending}
            className="w-full rounded-lg border border-brand-300 bg-brand-50 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            + Buat Bahan Setengah Jadi Baru: &quot;{run.item_name}&quot;
          </button>
        </div>
      )}

      {/* 2) Item sudah terhubung, tapi ada bahan dilaporkan yang belum dicocokkan */}
      {itemResolved && unresolvedReportedLines.length > 0 && !rejecting && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-white p-3">
          <p className="text-[11px] font-semibold text-zinc-600">
            Ada {unresolvedReportedLines.length} bahan yang dilaporkan belum dicocokkan ke bahan baku:
          </p>
          {unresolvedReportedLines.map((line) => (
            <div key={line.id} className="rounded-lg border border-zinc-200 p-2">
              <p className="mb-1.5 text-xs font-medium text-zinc-700">
                &quot;{line.reported_name}&quot; — {formatQty(Number(line.qty))} {line.reported_unit}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={chosenIngredientByRow[line.id] ?? ""}
                  onChange={(e) => setChosenIngredientByRow((prev) => ({ ...prev, [line.id]: e.target.value }))}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">— Ini bahan baku yang mana… —</option>
                  {existingIngredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const chosen = chosenIngredientByRow[line.id];
                    if (chosen) run_(() => linkReportedIngredientAction(line.id, chosen));
                  }}
                  disabled={pending || !chosenIngredientByRow[line.id]}
                  className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Gabung
                </button>
              </div>
              <button
                onClick={() => run_(() => createIngredientForReportedAction(line.id))}
                disabled={pending}
                className="mt-1.5 w-full rounded-lg border border-brand-300 bg-brand-50 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                + Buat Bahan Baku Baru: &quot;{line.reported_name}&quot;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 3) Semua terhubung -- tampilkan pembanding & pilihan verifikasi */}
      {itemResolved && unresolvedReportedLines.length === 0 && !rejecting && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
                Resep Standar (otomatis)
              </p>
              {standardPreview.length === 0 ? (
                <p className="text-[11px] text-zinc-400">Belum ada resep untuk item ini.</p>
              ) : (
                <div className="space-y-1">
                  {standardPreview.map((line) => {
                    const insufficient = line.needed > line.availableStock + 1e-9;
                    return (
                      <div key={line.name} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-zinc-600">{line.name}</span>
                        <span className={insufficient ? "font-semibold text-red-600" : "text-zinc-700"}>
                          {formatQty(line.needed)} {line.unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
                Dilaporkan Staf (aktual)
              </p>
              {reportedLines.length === 0 ? (
                <p className="text-[11px] text-zinc-400">Staf tidak melaporkan bahan.</p>
              ) : (
                <div className="space-y-1">
                  {reportedLines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-zinc-600">{line.reported_name}</span>
                      <span className="text-zinc-700">
                        {formatQty(Number(line.qty))} {line.reported_unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => run_(() => verifyAction(false))}
              disabled={pending || standardPreview.length === 0}
              title={standardPreview.length === 0 ? "Belum ada resep standar" : undefined}
              className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Memproses…" : "Verifikasi pakai Resep Standar"}
            </button>
            <button
              onClick={() => run_(() => verifyAction(true))}
              disabled={pending || !allReportedResolved}
              title={!allReportedResolved ? "Staf tidak melaporkan bahan untuk batch ini" : undefined}
              className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Memproses…" : "Verifikasi pakai Yang Dilaporkan"}
            </button>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan penolakan (wajib)"
            className="w-full rounded-lg border border-red-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-200"
          />
          <div className="flex gap-2">
            <button
              onClick={() => run_(() => rejectAction(reason))}
              disabled={pending}
              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Menolak…" : "Ya, Tolak"}
            </button>
            <button
              onClick={() => {
                setRejecting(false);
                setError(null);
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700"
            >
              Batal
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
