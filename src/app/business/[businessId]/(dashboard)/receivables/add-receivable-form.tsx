"use client";

import { useActionState, useState } from "react";
import type { AddReceivableState } from "./actions";

const initialState: AddReceivableState = { error: null, resetToken: 0 };

type CustomerOption = { id: string; name: string };

export default function AddReceivableForm({
  action,
  today,
  customers,
}: {
  action: (state: AddReceivableState, formData: FormData) => Promise<AddReceivableState>;
  today: string;
  customers: CustomerOption[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <ReceivableFormFields
      key={state.resetToken}
      formAction={formAction}
      pending={pending}
      error={state.error}
      today={today}
      customers={customers}
    />
  );
}

function ReceivableFormFields({
  formAction,
  pending,
  error,
  today,
  customers,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  today: string;
  customers: CustomerOption[];
}) {
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"utang" | "sebagian">("utang");
  const [paidAmount, setPaidAmount] = useState("");

  const effectivePaidAmount = paymentMode === "utang" ? "0" : paidAmount;

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="date" className="mb-1 block text-xs font-medium text-zinc-600">
            Tanggal
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={today}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="customerId" className="mb-1 block text-xs font-medium text-zinc-600">
            Pelanggan (opsional)
          </label>
          <select
            id="customerId"
            name="customerId"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Tanpa pelanggan —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-xs font-medium text-zinc-600">
          Deskripsi
        </label>
        <input
          id="description"
          name="description"
          type="text"
          placeholder="mis. Jual 2 karung beras"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div>
        <label htmlFor="amount" className="mb-1 block text-xs font-medium text-zinc-600">
          Total Tagihan (Rp)
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          min="0"
          step="1"
          placeholder="500000"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Dibayar Sekarang</label>
        <div className="flex gap-1.5">
          {(
            [
              { key: "utang", label: "Belum Bayar Sama Sekali" },
              { key: "sebagian", label: "Bayar Sebagian" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPaymentMode(opt.key)}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                paymentMode === opt.key
                  ? "bg-brand-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {paymentMode === "sebagian" && (
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Jumlah dibayar sekarang (Rp)"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        )}
        <input type="hidden" name="paidAmount" value={effectivePaidAmount} />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Catat Piutang"}
      </button>
    </form>
  );
}
