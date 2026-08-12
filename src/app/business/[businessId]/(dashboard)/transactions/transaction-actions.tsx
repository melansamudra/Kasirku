"use client";

import { useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import ImportTransactionsForm from "./import-transactions-form";
import type { ImportTransactionsState } from "./actions";

// Export/import/manual-add are backoffice bulk-data tools, not something a
// cashier needs from the Android app — only the transaction list itself
// (rendered by the server component around these) stays visible there.
export function TransactionActions({
  businessId,
  importAction,
}: {
  businessId: string;
  importAction: (
    state: ImportTransactionsState,
    formData: FormData,
  ) => Promise<ImportTransactionsState>;
}) {
  const [importOpen, setImportOpen] = useState(false);

  if (Capacitor.isNativePlatform()) return null;

  return (
    <>
      <div className="flex shrink-0 gap-2">
        <a
          href={`/business/${businessId}/transactions/export`}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          ⬇️ Ekspor CSV
        </a>
        <a
          href={`/business/${businessId}/transactions/export-full`}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          ⬇️ Ekspor Lengkap
        </a>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          📥 Impor CSV
        </button>
        <Link
          href={`/business/${businessId}/transactions/new`}
          className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          + Tambah Transaksi Manual
        </Link>
      </div>

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setImportOpen(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Impor dari CSV</h2>
              <button
                onClick={() => setImportOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Kolom: Referensi, Tanggal (YYYY-MM-DD), Nama Produk, Qty, Metode Bayar, Pelanggan
              (opsional). Baris dengan Referensi yang sama digabung jadi satu transaksi — pakai
              ini untuk transaksi dengan lebih dari satu produk. Produk & pelanggan harus sudah
              ada di data toko ini.
            </p>
            <div className="mt-4">
              <ImportTransactionsForm action={importAction} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
