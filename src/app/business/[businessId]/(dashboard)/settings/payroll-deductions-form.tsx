"use client";

import { useActionState } from "react";
import type { PayrollDeductionsState } from "./actions";

const initialState: PayrollDeductionsState = { error: null, saved: false };

export default function PayrollDeductionsForm({
  action,
  izinDeductionWeekday,
  izinDeductionWeekend,
  lateDeductionPerOccurrence,
}: {
  action: (state: PayrollDeductionsState, formData: FormData) => Promise<PayrollDeductionsState>;
  izinDeductionWeekday: number;
  izinDeductionWeekend: number;
  lateDeductionPerOccurrence: number;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="izinDeductionWeekday" className="mb-1 block text-xs font-medium text-zinc-600">
          Potongan Izin — Hari Biasa (Rp)
        </label>
        <input
          id="izinDeductionWeekday"
          name="izinDeductionWeekday"
          type="number"
          min="0"
          step="1"
          defaultValue={izinDeductionWeekday}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label htmlFor="izinDeductionWeekend" className="mb-1 block text-xs font-medium text-zinc-600">
          Potongan Izin — Weekend (Sabtu/Minggu) (Rp)
        </label>
        <input
          id="izinDeductionWeekend"
          name="izinDeductionWeekend"
          type="number"
          min="0"
          step="1"
          defaultValue={izinDeductionWeekend}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Izin sekarang tetap dihitung sebagai hari kerja di gaji pokok, tapi kena potongan tetap
          ini per hari izin — menggantikan cara lama (izin = tidak dibayar sama sekali).
        </p>
      </div>
      <div className="border-t border-zinc-100 pt-4">
        <label htmlFor="lateDeductionPerOccurrence" className="mb-1 block text-xs font-medium text-zinc-600">
          Potongan per Kali Terlambat (Rp)
        </label>
        <input
          id="lateDeductionPerOccurrence"
          name="lateDeductionPerOccurrence"
          type="number"
          min="0"
          step="1"
          defaultValue={lateDeductionPerOccurrence}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Dihitung otomatis dari berapa kali karyawan ditandai &quot;Terlambat&quot; di halaman
          Absensi.
        </p>
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.saved && !state.error && !pending && (
        <p className="text-xs text-brand-700">✓ Tersimpan.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan"}
      </button>
    </form>
  );
}
