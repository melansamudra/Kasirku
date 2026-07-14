"use client";

import { useActionState, useRef, useEffect } from "react";
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

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
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
