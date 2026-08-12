"use client";

import { useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import ImportTransactionsForm from "./import-transactions-form";
import ImportMokaForm from "./import-moka-form";
import type { ImportTransactionsState, MokaPreviewState, MokaImportState } from "./actions";

// Export/import/manual-add are backoffice bulk-data tools, not something a
// cashier needs from the Android app — only the transaction list itself
// (rendered by the server component around these) stays visible there.
export function TransactionActions({
  businessId,
  importAction,
  previewMokaAction,
  importMokaAction,
}: {
  businessId: string;
  importAction: (state: ImportTransactionsState, formData: FormData) => Promise<ImportTransactionsState>;
  previewMokaAction: (state: MokaPreviewState, formData: FormData) => Promise<MokaPreviewState>;
  importMokaAction: (state: MokaImportState, formData: FormData) => Promise<MokaImportState>;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [mokaOpen, setMokaOpen] = useState(false);

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
        <button
          type="button"
          onClick={() => setMokaOpen(true)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          📥 Impor Moka POS
        </button>
        <Link
          href={`/business/${businessId}/transactions/new`}
          className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          + Tambah Transaksi Manual
        </Link>
      </div>

      {mokaOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMokaOpen(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Impor dari Moka POS</h2>
              <button
                onClick={() => setMokaOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                ✕
              </button>
            </div>
            <ImportMokaForm previewAction={previewMokaAction} importAction={importMokaAction} onClose={() => setMokaOpen(false)} />
          </div>
        </div>
      )}

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
              ini untuk transaksi dengan lebih dari satu produk. Produk &amp; pelanggan harus sudah
              ada di data toko ini.
            </p>
            <button
              type="button"
              onClick={() => {
                const rows = [
                  ["Referensi", "Tanggal", "Nama Produk", "Qty", "Metode Bayar", "Pelanggan"],
                  ["TRX-001", "2026-08-12", "Nasi Goreng", "2", "Tunai", ""],
                  ["TRX-001", "2026-08-12", "Es Teh", "1", "Tunai", ""],
                  ["TRX-002", "2026-08-12", "Ayam Bakar", "1", "EDC", "Budi"],
                ];
                const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
                const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "template-impor-transaksi.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              ⬇ Download Template CSV
            </button>
            <div className="mt-4">
              <ImportTransactionsForm action={importAction} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
