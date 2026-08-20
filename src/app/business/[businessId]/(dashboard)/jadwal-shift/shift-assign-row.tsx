"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ShiftOption = { id: string; name: string; startTime: string; endTime: string };

export default function ShiftAssignRow({
  employeeName,
  currentShiftId,
  shifts,
  date,
  assignAction,
  applyRangeAction,
}: {
  employeeName: string;
  currentShiftId: string | null;
  shifts: ShiftOption[];
  date: string;
  assignAction: (shiftTemplateId: string | null) => Promise<{ error: string | null }>;
  applyRangeAction: (shiftTemplateId: string, days: number) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [applyShiftId, setApplyShiftId] = useState(currentShiftId ?? shifts[0]?.id ?? "");
  const [applyDays, setApplyDays] = useState("7");

  async function handleAssign(value: string) {
    setError(null);
    setPending(true);
    const result = await assignAction(value || null);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleApplyRange() {
    setError(null);
    if (!applyShiftId) {
      setError("Pilih shift dulu.");
      return;
    }
    setPending(true);
    const result = await applyRangeAction(applyShiftId, Number(applyDays) || 0);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setShowApply(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">{employeeName}</p>
        <button
          type="button"
          onClick={() => setShowApply((v) => !v)}
          className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
        >
          Terapkan beberapa hari
        </button>
      </div>
      <select
        value={currentShiftId ?? ""}
        onChange={(e) => handleAssign(e.target.value)}
        disabled={pending}
        className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        <option value="">— Tidak ada shift {date} —</option>
        {shifts.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.startTime}–{s.endTime})
          </option>
        ))}
      </select>

      {showApply && (
        <div className="mt-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={applyShiftId}
              onChange={(e) => setApplyShiftId(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              max="90"
              value={applyDays}
              onChange={(e) => setApplyDays(e.target.value)}
              placeholder="Jumlah hari"
              className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
            />
          </div>
          <p className="text-[10px] text-zinc-400">
            Mulai dari {date}, {applyDays || 0} hari berturut-turut (termasuk hari ini).
          </p>
          <button
            type="button"
            onClick={handleApplyRange}
            disabled={pending}
            className="w-full rounded-lg bg-zinc-800 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Menerapkan…" : "Terapkan"}
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
