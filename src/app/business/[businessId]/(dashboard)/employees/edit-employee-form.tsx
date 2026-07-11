"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EditEmployeeState } from "./actions";

export default function EditEmployeeForm({
  name,
  dailyRate,
  note,
  cashierId,
  cashiers,
  action,
}: {
  name: string;
  dailyRate: number;
  note: string | null;
  cashierId: string | null;
  cashiers: { id: string; name: string }[];
  action: (state: EditEmployeeState, formData: FormData) => Promise<EditEmployeeState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    name,
    dailyRate: String(dailyRate),
    note: note ?? "",
    cashierId: cashierId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline"
      >
        Edit
      </button>
    );
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("dailyRate", values.dailyRate);
    formData.set("note", values.note);
    formData.set("cashierId", values.cashierId);
    const result = await action({ error: null }, formData);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Karyawan</label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Gaji Harian (Rp)</label>
        <input
          type="number"
          min="0"
          step="1"
          value={values.dailyRate}
          onChange={(e) => setValues((v) => ({ ...v, dailyRate: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Jabatan/Catatan
        </label>
        <input
          type="text"
          value={values.note}
          onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Akun Kasir Terhubung
        </label>
        <select
          value={values.cashierId}
          onChange={(e) => setValues((v) => ({ ...v, cashierId: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Tidak pegang kasir</option>
          {cashiers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={pending}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
