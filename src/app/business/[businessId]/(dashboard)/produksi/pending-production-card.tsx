"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "./actions";

export default function PendingProductionCard({
  run,
  existingItems,
  verifyAction,
  rejectAction,
  linkExistingAction,
  createNewAction,
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
  verifyAction: () => Promise<ActionState>;
  rejectAction: (reason: string) => Promise<ActionState>;
  linkExistingAction: (existingItemId: string) => Promise<ActionState>;
  createNewAction: () => Promise<ActionState>;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [chosenExistingId, setChosenExistingId] = useState("");
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

        {run.semi_finished_item_id && !rejecting && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => run_(verifyAction)}
              disabled={pending}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Memverifikasi…" : "Verifikasi"}
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={pending}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 hover:border-red-300 hover:text-red-600"
            >
              Tolak
            </button>
          </div>
        )}
      </div>

      {!run.semi_finished_item_id && !rejecting && (
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
          <button
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="w-full text-[11px] text-zinc-400 hover:text-red-600"
          >
            Tolak draft ini
          </button>
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
