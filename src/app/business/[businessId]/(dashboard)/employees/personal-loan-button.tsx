"use client";

import { useActionState, useRef, useEffect, useState, useTransition } from "react";
import {
  addPersonalLoan,
  updatePersonalLoan,
  deletePersonalLoan,
  type AddPersonalLoanState,
  type UpdatePersonalLoanState,
} from "./actions";

const initialState: AddPersonalLoanState = { error: null };
const initialUpdateState: UpdatePersonalLoanState = { error: null };

type PersonalLoan = { id: string; date: string; amount: number; note: string | null };

const inputClass =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PersonalLoanRow({ businessId, loan }: { businessId: string; loan: PersonalLoan }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: UpdatePersonalLoanState, formData: FormData) => {
      const res = await updatePersonalLoan(businessId, loan.id, prev, formData);
      if (res.saved) setEditing(false);
      return res;
    },
    initialUpdateState,
  );
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`Hapus catatan pinjaman Rp${loan.amount.toLocaleString("id-ID")}?`)) return;
    setDeleteError(null);
    startDelete(async () => {
      const res = await deletePersonalLoan(businessId, loan.id);
      if (res.error) setDeleteError(res.error);
    });
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-amber-200 bg-white p-2">
        <form action={formAction} className="space-y-2">
          <input name="date" type="date" required defaultValue={loan.date} className={inputClass} />
          <input
            name="amount"
            type="number"
            min="1"
            step="1"
            required
            defaultValue={loan.amount}
            placeholder="Nominal pinjaman (Rp)"
            className={inputClass}
          />
          <input
            name="note"
            type="text"
            defaultValue={loan.note ?? ""}
            placeholder="Catatan (opsional)"
            className={inputClass}
          />
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg border border-zinc-200 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-amber-600 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-800">
            Rp{loan.amount.toLocaleString("id-ID")}
          </p>
          <p className="text-[11px] text-zinc-400">
            {formatDate(loan.date)}
            {loan.note ? ` — ${loan.note}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-brand-600 hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-600 hover:underline disabled:opacity-60"
          >
            {deleting ? "Menghapus…" : "Hapus"}
          </button>
        </div>
      </div>
      {deleteError && <p className="mt-1 text-xs text-red-600">{deleteError}</p>}
    </li>
  );
}

export default function PersonalLoanButton({
  businessId,
  employeeId,
  outstanding,
  loans,
}: {
  businessId: string;
  employeeId: string;
  outstanding: number;
  loans: PersonalLoan[];
}) {
  const [open, setOpen] = useState(false);
  const boundAction = addPersonalLoan.bind(null, businessId, employeeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error && formRef.current) {
      formRef.current.reset();
    }
  }, [pending, state.error]);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-amber-600 hover:underline"
      >
        {outstanding > 0 ? `Pinjaman Pribadi: Rp${outstanding.toLocaleString("id-ID")}` : "+ Pinjaman Pribadi"}
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          {loans.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Riwayat Pinjaman
              </p>
              <ul className="space-y-1.5">
                {loans.map((loan) => (
                  <PersonalLoanRow key={loan.id} businessId={businessId} loan={loan} />
                ))}
              </ul>
            </div>
          )}

          <form ref={formRef} action={formAction} className="space-y-2">
            <p className="text-[11px] text-zinc-400">
              Cuma catatan/tanda — tidak lewat Kas Kecil, tidak menyentuh kas atau jurnal. Nominal
              potongannya dipilih nanti per-slip di halaman detail slip gaji.
            </p>
            <input
              name="amount"
              type="number"
              min="1"
              step="1"
              required
              placeholder="Nominal pinjaman (Rp)"
              className={inputClass}
            />
            <input name="note" type="text" placeholder="Catatan (opsional)" className={inputClass} />
            {state.error && <p className="text-xs text-red-600">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Menyimpan…" : "Catat Pinjaman Baru"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
