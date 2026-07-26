"use client";

import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import ImportTransactionsForm from "./import-transactions-form";
import type { ImportTransactionsState } from "./actions";

// Export/import/manual-add are backoffice bulk-data tools, not something a
// cashier needs from the Android app — only the transaction list itself
// (rendered by the server component around these) stays visible there.
export function TransactionButtons({ businessId }: { businessId: string }) {
  if (Capacitor.isNativePlatform()) return null;

  return (
    <div className="flex shrink-0 gap-2">
      <a
        href={`/business/${businessId}/transactions/export`}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
      >
        ⬇️ Ekspor CSV
      </a>
      <Link
        href={`/business/${businessId}/transactions/new`}
        className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
      >
        + Tambah Transaksi Manual
      </Link>
    </div>
  );
}

export function TransactionImportCard({
  importAction,
}: {
  importAction: (
    state: ImportTransactionsState,
    formData: FormData,
  ) => Promise<ImportTransactionsState>;
}) {
  if (Capacitor.isNativePlatform()) return null;

  return (
    <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Impor dari CSV</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Kolom: Referensi, Tanggal (YYYY-MM-DD), Nama Produk, Qty, Metode Bayar, Pelanggan
        (opsional). Baris dengan Referensi yang sama digabung jadi satu transaksi — pakai ini
        untuk transaksi dengan lebih dari satu produk. Produk & pelanggan harus sudah ada di
        data toko ini.
      </p>
      <div className="mt-4">
        <ImportTransactionsForm action={importAction} />
      </div>
    </div>
  );
}
