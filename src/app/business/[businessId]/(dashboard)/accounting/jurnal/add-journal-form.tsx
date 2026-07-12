"use client";

import { useActionState, useState } from "react";
import type { JournalState } from "./actions";

const initialState: JournalState = { error: null, resetToken: 0 };

type Account = { code: string; name: string };
type Line = { accountCode: string; debit: string; credit: string };

function emptyLine(defaultCode: string): Line {
  return { accountCode: defaultCode, debit: "", credit: "" };
}

export default function AddJournalForm({
  action,
  today,
  accounts,
}: {
  action: (state: JournalState, formData: FormData) => Promise<JournalState>;
  today: string;
  accounts: Account[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <JournalFormFields
      key={state.resetToken}
      formAction={formAction}
      pending={pending}
      error={state.error}
      today={today}
      accounts={accounts}
    />
  );
}

function JournalFormFields({
  formAction,
  pending,
  error,
  today,
  accounts,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  today: string;
  accounts: Account[];
}) {
  const defaultCode = accounts[0]?.code ?? "";
  const [lines, setLines] = useState<Line[]>([emptyLine(defaultCode), emptyLine(defaultCode)]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(defaultCode)]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  const linesPayload = JSON.stringify(
    lines.map((l) => ({
      account_code: l.accountCode,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    })),
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="lines" value={linesPayload} readOnly />

      <div className="grid grid-cols-2 gap-2.5">
        <input
          name="date"
          type="date"
          defaultValue={today}
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <input
          name="description"
          type="text"
          placeholder="Keterangan"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={line.accountCode}
              onChange={(e) => updateLine(i, { accountCode: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              placeholder="Debit"
              value={line.debit}
              onChange={(e) => updateLine(i, { debit: e.target.value, credit: "" })}
              className="w-24 shrink-0 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <input
              type="number"
              min="0"
              placeholder="Kredit"
              value={line.credit}
              onChange={(e) => updateLine(i, { credit: e.target.value, debit: "" })}
              className="w-24 shrink-0 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={() => removeLine(i)}
              disabled={lines.length <= 2}
              className="shrink-0 text-xs text-zinc-400 hover:text-red-500 disabled:opacity-30"
              title="Hapus baris"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addLine}
        className="text-xs font-medium text-brand-600 hover:underline"
      >
        + Tambah baris
      </button>

      <div
        className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold ${
          balanced ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"
        }`}
      >
        <span>Debit: {totalDebit.toLocaleString("id-ID")}</span>
        <span>Kredit: {totalCredit.toLocaleString("id-ID")}</span>
        <span>{balanced ? "✓ Seimbang" : "Belum seimbang"}</span>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending || !balanced}
        className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Posting Jurnal"}
      </button>
    </form>
  );
}
