"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EditCashierState } from "./actions";

export default function EditCashierForm({
  name,
  role,
  action,
}: {
  name: string;
  role: string;
  action: (state: EditCashierState, formData: FormData) => Promise<EditCashierState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ name, role });
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
    formData.set("role", values.role);
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
        <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Kasir</label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="flex gap-2">
        <label
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border py-2 text-xs ${
            values.role === "kasir" ? "border-brand-600 bg-brand-50" : "border-zinc-200"
          }`}
        >
          <input
            type="radio"
            checked={values.role === "kasir"}
            onChange={() => setValues((v) => ({ ...v, role: "kasir" }))}
            className="accent-brand-600"
          />
          Kasir
        </label>
        <label
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border py-2 text-xs ${
            values.role === "manajer" ? "border-brand-600 bg-brand-50" : "border-zinc-200"
          }`}
        >
          <input
            type="radio"
            checked={values.role === "manajer"}
            onChange={() => setValues((v) => ({ ...v, role: "manajer" }))}
            className="accent-brand-600"
          />
          Manajer
        </label>
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
