"use client";

import { useActionState, useState } from "react";
import type { PayrollDeductionsState } from "./actions";

const initialState: PayrollDeductionsState = { error: null, saved: false };

export default function PayrollDeductionsForm({
  action,
  izinDeductionMode,
  izinDeductionWeekday,
  izinDeductionWeekend,
  lateDeductionPerOccurrence,
  lemburRatePerHour,
}: {
  action: (state: PayrollDeductionsState, formData: FormData) => Promise<PayrollDeductionsState>;
  izinDeductionMode: "flat" | "full_day";
  izinDeductionWeekday: number;
  izinDeductionWeekend: number;
  lateDeductionPerOccurrence: number;
  lemburRatePerHour: number;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [mode, setMode] = useState<"flat" | "full_day">(izinDeductionMode);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Cara Hitung Potongan Izin</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("flat")}
            className={`rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
              mode === "flat"
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            Nominal Tetap
          </button>
          <button
            type="button"
            onClick={() => setMode("full_day")}
            className={`rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
              mode === "full_day"
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            Sesuai Gaji Harian
          </button>
        </div>
        <input type="hidden" name="izinDeductionMode" value={mode} />
        <p className="mt-1 text-[11px] text-zinc-400">
          {mode === "flat"
            ? "Potongan izin hari biasa & weekend pakai nominal Rp tetap yang diisi manual di bawah."
            : "Potongan izin hari biasa = 1 hari gaji penuh, dihitung otomatis dari rate karyawan (bukan angka tetap). Izin weekend = 1 hari gaji penuh + denda tambahan di bawah."}
        </p>
      </div>

      {mode === "flat" && (
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
      )}
      {mode === "full_day" && (
        <input type="hidden" name="izinDeductionWeekday" value={izinDeductionWeekday} />
      )}
      <div>
        <label htmlFor="izinDeductionWeekend" className="mb-1 block text-xs font-medium text-zinc-600">
          {mode === "flat" ? "Potongan Izin — Weekend (Sabtu/Minggu) (Rp)" : "Denda Tambahan Izin Weekend (Rp)"}
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
          {mode === "flat"
            ? "Izin sekarang tetap dihitung sebagai hari kerja di gaji pokok, tapi kena potongan tetap ini per hari izin — menggantikan cara lama (izin = tidak dibayar sama sekali)."
            : "Ditambahkan di atas potongan 1 hari gaji penuh, khusus izin yang jatuh di Sabtu/Minggu."}
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
      <div className="border-t border-zinc-100 pt-4">
        <label htmlFor="lemburRatePerHour" className="mb-1 block text-xs font-medium text-zinc-600">
          Rate Lembur per Jam — Default (Rp)
        </label>
        <input
          id="lemburRatePerHour"
          name="lemburRatePerHour"
          type="number"
          min="0"
          step="1"
          defaultValue={lemburRatePerHour}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Dipakai kalau karyawan tidak punya rate lembur sendiri (bisa diatur per karyawan di
          halaman Karyawan).
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
