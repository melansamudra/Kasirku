"use client";

import { useActionState, useRef, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addRecurringAllowance,
  updateRecurringAllowance,
  toggleRecurringAllowanceActive,
  deleteRecurringAllowance,
  type AddRecurringAllowanceState,
} from "./actions";

const initialState: AddRecurringAllowanceState = { error: null };

type Allowance = { id: string; label: string; amount: number; active: boolean };

function AllowanceRow({ businessId, allowance }: { businessId: string; allowance: Allowance }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(allowance.label);
  const [amount, setAmount] = useState(String(allowance.amount));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateRecurringAllowance(businessId, allowance.id, label, Number(amount) || 0);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function handleToggle() {
    startTransition(async () => {
      await toggleRecurringAllowanceActive(businessId, allowance.id, !allowance.active);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Hapus tunjangan "${allowance.label}"?`)) return;
    startTransition(async () => {
      await deleteRecurringAllowance(businessId, allowance.id);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-white p-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <input
          type="number"
          min="0"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <div className="flex gap-1.5">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 rounded-lg bg-brand-600 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Simpan
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg px-2 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-700"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${
        allowance.active ? "border-zinc-200 bg-white" : "border-zinc-100 bg-zinc-50 opacity-60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-zinc-900">{allowance.label}</p>
        <p className={`text-[11px] ${allowance.amount > 0 ? "text-zinc-500" : "text-amber-600"}`}>
          {allowance.amount > 0
            ? `Rp${allowance.amount.toLocaleString("id-ID")}/bulan`
            : "Nominal belum diisi — belum ikut ke slip"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={isPending}
          className={`text-[11px] font-medium hover:underline disabled:opacity-50 ${
            allowance.active ? "text-zinc-400" : "text-brand-600"
          }`}
        >
          {allowance.active ? "Nonaktifkan" : "Aktifkan"}
        </button>
        <button onClick={() => setEditing(true)} className="text-[11px] font-medium text-zinc-400 hover:text-brand-600">
          Edit
        </button>
        <button onClick={handleDelete} disabled={isPending} className="text-[11px] font-medium text-zinc-400 hover:text-red-600">
          Hapus
        </button>
      </div>
    </div>
  );
}

export default function RecurringAllowancesButton({
  businessId,
  employeeId,
  allowances,
}: {
  businessId: string;
  employeeId: string;
  allowances: Allowance[];
}) {
  const [open, setOpen] = useState(false);
  const boundAction = addRecurringAllowance.bind(null, businessId, employeeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error && formRef.current) {
      formRef.current.reset();
    }
  }, [pending, state.error]);

  const activeCount = allowances.filter((a) => a.active).length;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-brand-600 hover:underline"
      >
        {allowances.length > 0 ? `Tunjangan Tetap (${activeCount} aktif)` : "+ Tunjangan Tetap"}
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-[11px] text-zinc-400">
            Tunjangan aktif otomatis kesalin ke setiap slip gaji baru — tidak perlu diketik ulang tiap
            bulan. Bisa lebih dari satu.
          </p>

          {allowances.length > 0 && (
            <div className="space-y-1.5">
              {allowances.map((a) => (
                <AllowanceRow key={a.id} businessId={businessId} allowance={a} />
              ))}
            </div>
          )}

          <form ref={formRef} action={formAction} className="space-y-1.5 border-t border-zinc-200 pt-2">
            <input
              name="label"
              type="text"
              required
              placeholder="Nama tunjangan, mis. Tunjangan Jabatan"
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <input
              name="amount"
              type="number"
              min="0"
              step="1"
              required
              placeholder="Nominal per bulan (Rp) — isi 0 kalau belum ditentukan"
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {state.error && <p className="text-[11px] text-red-600">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-brand-600 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Menyimpan…" : "+ Tambah Tunjangan"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
