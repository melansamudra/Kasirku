"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { AddEmployeeState } from "./actions";

const initialState: AddEmployeeState = { error: null };

export default function AddEmployeeForm({
  cashiers,
  action,
}: {
  cashiers: { id: string; name: string }[];
  action: (state: AddEmployeeState, formData: FormData) => Promise<AddEmployeeState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [salaryType, setSalaryType] = useState<"harian" | "bulanan">("harian");

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onReset={() => setSalaryType("harian")}
      className="space-y-4"
    >
      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Karyawan
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. Siti"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Tipe Gaji</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSalaryType("harian")}
            className={`rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
              salaryType === "harian"
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            Harian
          </button>
          <button
            type="button"
            onClick={() => setSalaryType("bulanan")}
            className={`rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
              salaryType === "bulanan"
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            Bulanan
          </button>
        </div>
        <input type="hidden" name="salaryType" value={salaryType} />
      </div>

      {salaryType === "harian" ? (
        <div>
          <label htmlFor="dailyRate" className="mb-1 block text-xs font-medium text-zinc-600">
            Gaji Harian (Rp, opsional)
          </label>
          <input
            id="dailyRate"
            name="dailyRate"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="mis. 100000"
          />
          <p className="mt-1 text-[11px] text-zinc-400">Dikali jumlah hari hadir tiap dibuatkan slip gaji.</p>
        </div>
      ) : (
        <div>
          <label htmlFor="monthlyRate" className="mb-1 block text-xs font-medium text-zinc-600">
            Gaji Bulanan (Rp, opsional)
          </label>
          <input
            id="monthlyRate"
            name="monthlyRate"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="mis. 3000000"
          />
          <p className="mt-1 text-[11px] text-zinc-400">Nominal flat per periode slip gaji, tidak dihitung dari hari hadir.</p>
        </div>
      )}

      <div>
        <label htmlFor="lemburRatePerHour" className="mb-1 block text-xs font-medium text-zinc-600">
          Rate Lembur per Jam (Rp, opsional)
        </label>
        <input
          id="lemburRatePerHour"
          name="lemburRatePerHour"
          type="number"
          min="0"
          step="1"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. 20000"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Kosongkan untuk pakai rate lembur default toko (diatur di halaman Payroll).
        </p>
      </div>

      <div>
        <label htmlFor="note" className="mb-1 block text-xs font-medium text-zinc-600">
          Jabatan/Catatan (opsional)
        </label>
        <input
          id="note"
          name="note"
          type="text"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. Juru masak"
        />
      </div>

      <div>
        <label htmlFor="contractEnd" className="mb-1 block text-xs font-medium text-zinc-600">
          Tanggal Berakhir Kontrak (opsional)
        </label>
        <input
          id="contractEnd"
          name="contractEnd"
          type="date"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Kosongkan kalau karyawan tetap/tidak ada batas kontrak.
        </p>
      </div>

      <div>
        <label htmlFor="cashierId" className="mb-1 block text-xs font-medium text-zinc-600">
          Akun Kasir Terhubung (opsional)
        </label>
        <select
          id="cashierId"
          name="cashierId"
          defaultValue=""
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Tidak pegang kasir</option>
          {cashiers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-zinc-400">
          Isi kalau karyawan ini juga login ke layar kasir, supaya tidak double catat.
        </p>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Tambah Karyawan"}
      </button>
    </form>
  );
}
