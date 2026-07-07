"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { checkInTicket } from "../ticket-actions";
import SwitchCashierButton from "../switch-cashier-button";

type Category = { id: string; name: string };

type CheckResult =
  | { kind: "success"; categoryName: string; price: number; invoiceNumber: string; isMemberPrice: boolean }
  | { kind: "error"; message: string };

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default function CheckInScreen({
  businessId,
  businessName,
  cashierId,
  cashierName,
  categories,
}: {
  businessId: string;
  businessName: string;
  cashierId: string;
  cashierName: string;
  categories: Category[];
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [manualNumber, setManualNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId || busy) return;

    setBusy(true);
    const res = await checkInTicket(businessId, cashierId, categoryId, manualNumber);
    setBusy(false);
    setManualNumber("");
    inputRef.current?.focus();

    setResult(
      res.success
        ? {
            kind: "success",
            categoryName: res.categoryName,
            price: res.price,
            invoiceNumber: res.invoiceNumber,
            isMemberPrice: res.isMemberPrice,
          }
        : { kind: "error", message: res.error },
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-6">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">{businessName}</h1>
            <p className="text-xs text-zinc-500">Check-in Tiket · Kasir: {cashierName}</p>
          </div>
          <Link
            href={`/business/${businessId}/pos`}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            ← Kasir
          </Link>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <label className="mb-1 block text-xs font-medium text-zinc-600">Kategori</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {categories.length === 0 && <option value="">Belum ada kategori tiket</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label className="mb-1 mt-3 block text-xs font-medium text-zinc-600">
            No. Tiket Fisik
          </label>
          <input
            ref={inputRef}
            type="text"
            value={manualNumber}
            onChange={(e) => setManualNumber(e.target.value)}
            placeholder="Scan / ketik nomor tiket"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-base focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />

          <button
            type="submit"
            disabled={busy || !categoryId}
            className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Memeriksa…" : "Cek Tiket"}
          </button>
        </form>

        {result && (
          <div
            className={`mt-4 rounded-2xl border p-4 text-center ${
              result.kind === "success"
                ? "border-brand-200 bg-brand-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            {result.kind === "success" ? (
              <>
                <p className="text-2xl">✅</p>
                <p className="mt-1 text-sm font-bold text-brand-700">Boleh Masuk</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {result.categoryName}
                  {result.isMemberPrice && (
                    <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                      Member
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  {result.invoiceNumber} · {formatRupiah(result.price)}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl">🚫</p>
                <p className="mt-1 text-sm font-bold text-red-700">Tidak Boleh Masuk</p>
                <p className="mt-1 text-xs text-red-600">{result.message}</p>
              </>
            )}
          </div>
        )}

        <SwitchCashierButton />
      </div>
    </div>
  );
}
