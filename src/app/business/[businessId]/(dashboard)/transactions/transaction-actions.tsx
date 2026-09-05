"use client";

import { useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import ImportTransactionsForm from "./import-transactions-form";
import ImportMokaForm from "./import-moka-form";
import ImportEsbForm from "./import-esb-form";
import type { ImportTransactionsState, MokaPreviewState, MokaImportState } from "./actions";
import type { EsbPreviewState, ImportEsbState } from "./esb-actions";

// Export/import/manual-add are backoffice bulk-data tools, not something a
// cashier needs from the Android app — only the transaction list itself
// (rendered by the server component around these) stays visible there.
export function TransactionActions({
  businessId,
  importAction,
  previewEsbAction,
  importEsbAction,
  previewMokaAction,
  importMokaAction,
  costControlEnabled = false,
  stockLocationsEnabled = false,
  richStockOpsEnabled = false,
}: {
  businessId: string;
  importAction: (state: ImportTransactionsState, formData: FormData) => Promise<ImportTransactionsState>;
  previewEsbAction: (state: EsbPreviewState, formData: FormData) => Promise<EsbPreviewState>;
  importEsbAction: (state: ImportEsbState, formData: FormData) => Promise<ImportEsbState>;
  previewMokaAction: (state: MokaPreviewState, formData: FormData) => Promise<MokaPreviewState>;
  importMokaAction: (state: MokaImportState, formData: FormData) => Promise<MokaImportState>;
  costControlEnabled?: boolean;
  stockLocationsEnabled?: boolean;
  richStockOpsEnabled?: boolean;
}) {
  const canImportRekap = costControlEnabled || stockLocationsEnabled || richStockOpsEnabled;
  const [importOpen, setImportOpen] = useState(false);
  const [esbOpen, setEsbOpen] = useState(false);
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
        {/* Laporan DETAIL dari POS pihak ketiga (mis. ESB "Sales
            Recapitulation Detail Report") -- satu baris per menu per
            transaksi, sudah punya nomor transaksi + jam + tax/service
            per baris. Fitur "Impor Rekap Penjualan" (Menu+Qty ringkas
            tanpa nomor transaksi, cuma pakai `rekap-actions.ts`) sengaja
            dihapus atas permintaan user 2026-09-05 -- ESB ini satu-satunya
            jalur impor rekap yang dipertahankan. */}
        {canImportRekap && (
          <button
            type="button"
            onClick={() => setEsbOpen(true)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            📥 Impor Detail ESB
          </button>
        )}
        {/* Moka POS itu produk POS pihak ketiga spesifik -- tidak relevan
            buat bisnis cost-control (Llauk Nusantara dkk SENGAJA tidak jual
            lewat POS Kasirku ataupun Moka sama sekali). */}
        {!costControlEnabled && (
          <button
            type="button"
            onClick={() => setMokaOpen(true)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            📥 Impor Moka POS
          </button>
        )}
        <Link
          href={`/business/${businessId}/transactions/new`}
          className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {costControlEnabled ? "+ Catat Penjualan" : "+ Tambah Transaksi Manual"}
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
              ada di data toko ini
              {costControlEnabled ? " — \"Nama Produk\" di sini harus sama persis dengan nama di Produk Jadi (HPP)." : "."}
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

      {esbOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEsbOpen(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Impor Detail ESB</h2>
              <button
                onClick={() => setEsbOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Upload file Excel &quot;Sales Recapitulation Detail Report&quot; asli dari ESB (jangan
              diubah kolomnya). Baris dengan <strong>Sales Number</strong> yang sama digabung jadi 1
              transaksi. Harga, Service Charge &amp; Tax dicatat persis seperti di file (bukan
              dihitung ulang), jam transaksi ikut kolom Sales Date In (jadi bisa terlihat per jam
              di daftar transaksi), dan stok bahan baku ikut terpotong otomatis lewat menu yang
              resepnya sudah diisi. Menu yang <strong>sudah ada</strong> di{" "}
              {costControlEnabled ? "Produk Jadi (HPP)" : "Kelola Produk"} langsung dipakai; yang{" "}
              <strong>belum ada</strong> otomatis dibuat baru pakai Kategori &amp; Harga dari file.
              Upload file yang sama 2x aman — transaksi yang sudah pernah masuk otomatis dilewati.
            </p>
            <div className="mt-4">
              <ImportEsbForm previewAction={previewEsbAction} importAction={importEsbAction} onClose={() => setEsbOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
