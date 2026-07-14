"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoice, type InvoiceLineInput } from "../actions";

type CustomerOption = { id: string; name: string };

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

let lineKeySeq = 0;
function nextLineKey() {
  lineKeySeq += 1;
  return lineKeySeq;
}

type LineRow = InvoiceLineInput & { key: number };

function emptyLine(): LineRow {
  return { key: nextLineKey(), description: "", qty: 1, unitPrice: 0 };
}

export default function InvoiceForm({
  businessId,
  today,
  customers,
}: {
  businessId: string;
  today: string;
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [dpAmount, setDpAmount] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subtotal = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const dp = Number(dpAmount) || 0;
  const sisa = Math.max(subtotal - dp, 0);

  function updateLine(key: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function handleSelectCustomer(id: string) {
    setCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) setCustomerName(found.name);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createInvoice(businessId, {
        customerId: customerId || null,
        customerName,
        date,
        dueDate: dueDate || null,
        dpAmount: dp,
        note: note || null,
        lines: lines.map(({ description, qty, unitPrice }) => ({ description, qty, unitPrice })),
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.push(`/business/${businessId}/invoices/${result.invoiceId}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">
            Pilih dari Pelanggan (opsional)
          </label>
          <select
            value={customerId}
            onChange={(e) => handleSelectCustomer(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Klien baru —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Klien</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="mis. Budi Santoso"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

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
          <label className="mb-1 block text-xs font-medium text-zinc-600">Jatuh Tempo (opsional)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Item Invoice</label>
        <div className="space-y-2 rounded-xl bg-zinc-50 p-3">
          {lines.map((line) => (
            <div key={line.key} className="grid grid-cols-12 gap-1.5">
              <input
                type="text"
                value={line.description}
                onChange={(e) => updateLine(line.key, { description: e.target.value })}
                placeholder="Deskripsi item"
                className="col-span-6 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.qty}
                onChange={(e) => updateLine(line.key, { qty: Number(e.target.value) })}
                placeholder="Qty"
                className="col-span-2 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <input
                type="number"
                min="0"
                step="1"
                value={line.unitPrice}
                onChange={(e) => updateLine(line.key, { unitPrice: Number(e.target.value) })}
                placeholder="Harga satuan"
                className="col-span-3 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                onClick={() => removeLine(line.key)}
                disabled={lines.length <= 1}
                className="col-span-1 rounded-lg text-xs text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            + Tambah Item
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 p-3 text-xs text-zinc-600">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="font-semibold text-zinc-900">{formatRupiah(subtotal)}</span>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">DP / Uang Muka (Rp, opsional)</label>
        <input
          type="number"
          min="0"
          step="1"
          value={dpAmount}
          onChange={(e) => setDpAmount(e.target.value)}
          placeholder="0"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {dp > 0 && (
          <p className="mt-1 text-[11px] text-zinc-400">Sisa tagihan: {formatRupiah(sisa)}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan Invoice"}
      </button>
    </div>
  );
}
