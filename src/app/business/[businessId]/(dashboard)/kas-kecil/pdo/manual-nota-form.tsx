"use client";

import { useState, useTransition } from "react";
import { addManualNotaKeluar } from "./actions";

type Account = { code: string; name: string };

export default function ManualNotaForm({
  businessId,
  today,
  accounts,
}: {
  businessId: string;
  today: string;
  accounts: Account[];
}) {
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"tunai" | "transfer">("tunai");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);

    if (!accountCode) {
      setError("Pilih akun dulu.");
      return;
    }

    startTransition(async () => {
      const result = await addManualNotaKeluar(businessId, date, description, Number(amount), accountCode, paymentMethod);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDescription("");
      setAmount("");
      setAccountCode("");
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 print:hidden">
      <h3 className="text-sm font-semibold text-zinc-900">+ Tambah Nota Keluar Manual</h3>
      <p className="mt-0.5 text-xs text-zinc-500">
        Buat nota kas keluar langsung di sini kalau lebih cepat daripada nyari di Kas & Bank — otomatis
        masuk ke daftar nota di bawah.
      </p>

      <div className="mt-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Tanggal</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Jumlah (Rp)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="mis. 50000"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Kategori (akun beban)</label>
          <select
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="" disabled>— Pilih akun —</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Metode</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setPaymentMethod("tunai")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                paymentMethod === "tunai"
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              💵 Tunai
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("transfer")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                paymentMethod === "transfer"
                  ? "bg-zinc-800 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              🏦 Transfer
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Keterangan</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="mis. Bayar Supplier"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "+ Catat Nota Keluar"}
        </button>
      </div>
    </div>
  );
}
