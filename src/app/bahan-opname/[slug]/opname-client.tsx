"use client";

import { useActionState, useState } from "react";
import type { SubmitPublicOpnameState } from "./actions";

const initialState: SubmitPublicOpnameState = { error: null, success: false };

type Ingredient = { id: string; name: string; unit: string; stock: number; departments: string[] };

const DEPARTMENT_LABELS: Record<string, string> = { dapur: "Dapur", bar: "Bar", front: "Front" };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function OpnameClient({
  businessName,
  ingredients,
  action,
}: {
  businessName: string;
  ingredients: Ingredient[];
  action: (state: SubmitPublicOpnameState, formData: FormData) => Promise<SubmitPublicOpnameState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const departmentsInUse = Array.from(new Set(ingredients.flatMap((i) => i.departments))).sort();
  const [divisi, setDivisi] = useState<string>(departmentsInUse[0] ?? "");

  const visible = divisi ? ingredients.filter((i) => i.departments.includes(divisi)) : ingredients;

  if (state.success) {
    return (
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-brand-700">✓ Hasil opname terkirim</p>
        <p className="mt-1.5 text-xs text-zinc-500">
          Terima kasih. Admin akan verifikasi hasil hitung ini sebelum stok sistem disesuaikan.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
      <h1 className="text-base font-bold text-zinc-900">Stock Opname — {businessName}</h1>
      <p className="mt-1 text-xs text-zinc-500">Hitung fisik bahan baku, lalu kirim hasilnya untuk diverifikasi admin.</p>

      <form action={formAction} className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-zinc-600">
            Tanggal
            <input
              name="entryDate"
              type="date"
              required
              defaultValue={todayStr()}
              className="mt-1 block w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Nama Kamu
            <input
              name="submittedByName"
              type="text"
              placeholder="Nama staf"
              className="mt-1 block w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
            />
          </label>
        </div>

        {departmentsInUse.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-600">Divisi</p>
            <div className="flex flex-wrap gap-2">
              {departmentsInUse.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDivisi(d)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    divisi === d ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {DEPARTMENT_LABELS[d] ?? d}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {visible.map((ing) => (
            <div key={ing.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-800">{ing.name}</p>
                <p className="text-[11px] text-zinc-400">
                  Sistem: {ing.stock} {ing.unit}
                </p>
              </div>
              <input
                name={`reported_${ing.id}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="Stok fisik"
                className="w-28 shrink-0 rounded-lg border border-zinc-200 px-2 py-1.5 text-right text-xs focus:border-brand-600 focus:outline-none"
              />
            </div>
          ))}
          {visible.length === 0 && (
            <p className="py-4 text-center text-xs text-zinc-400">Tidak ada bahan di divisi ini.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Mengirim..." : "Kirim Hasil Opname"}
        </button>
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      </form>
    </div>
  );
}
