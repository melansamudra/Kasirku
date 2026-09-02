"use client";

import { useState } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import ImportTransactionsForm from "./import-transactions-form";
import ImportSalesRecapForm from "./import-sales-recap-form";
import ImportMokaForm from "./import-moka-form";
import type { ImportTransactionsState, MokaPreviewState, MokaImportState } from "./actions";
import type { ImportSalesRecapState } from "./rekap-actions";

// Export/import/manual-add are backoffice bulk-data tools, not something a
// cashier needs from the Android app — only the transaction list itself
// (rendered by the server component around these) stays visible there.
export function TransactionActions({
  businessId,
  importAction,
  importRekapAction,
  previewMokaAction,
  importMokaAction,
  costControlEnabled = false,
  stockLocationsEnabled = false,
}: {
  businessId: string;
  importAction: (state: ImportTransactionsState, formData: FormData) => Promise<ImportTransactionsState>;
  importRekapAction: (state: ImportSalesRecapState, formData: FormData) => Promise<ImportSalesRecapState>;
  previewMokaAction: (state: MokaPreviewState, formData: FormData) => Promise<MokaPreviewState>;
  importMokaAction: (state: MokaImportState, formData: FormData) => Promise<MokaImportState>;
  costControlEnabled?: boolean;
  stockLocationsEnabled?: boolean;
}) {
  const canImportRekap = costControlEnabled || stockLocationsEnabled;
  const [importOpen, setImportOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
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
        {/* Rekap periode (mis. laporan bulanan dari POS lain kayak ESB) --
            beda dari "Impor CSV" yang butuh Referensi+Tanggal per baris,
            ini cuma "Menu, Qty" digabung jadi 1 transaksi. Cocokkan ke
            Produk Jadi (HPP) untuk bisnis cost-control, atau ke Kelola
            Produk biasa untuk bisnis stok-lite (stock_locations_enabled). */}
        {canImportRekap && (
          <button
            type="button"
            onClick={() => setRecapOpen(true)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            📥 Impor Rekap Penjualan
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

      {recapOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRecapOpen(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Impor Rekap Penjualan</h2>
              <button
                onClick={() => setRecapOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Buat rekap penjualan dari file Excel/CSV. Kolom:{" "}
              <strong>Tanggal, Menu, Kategori, Harga, Qty</strong>. Tanggal per baris boleh
              dikosongkan (jatuh ke Tanggal Default di form) — kalau sumbernya cuma total sebulan
              (mis. rekap ESB) tanpa breakdown harian, kosongkan semua Tanggal. Baris dengan
              Tanggal sama digabung jadi 1 transaksi. Menu yang <strong>sudah ada</strong> di{" "}
              {costControlEnabled ? "Produk Jadi (HPP)" : "Kelola Produk"} langsung dipakai
              (Kategori/Harga di baris itu diabaikan) — stok bahan bakunya ikut terpotong otomatis
              kalau resepnya sudah diisi. Menu yang <strong>belum ada</strong> otomatis dibuat
              sebagai {costControlEnabled ? "Produk Jadi" : "produk"} baru pakai Kategori &amp; Harga
              dari baris itu (HPP-nya nol sampai resepnya diisi manual) — jadi kedua kolom itu wajib
              diisi buat menu yang belum ada.
            </p>
            <a
              href="/template-rekap-penjualan"
              download
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              ⬇ Download Template Excel
            </a>
            <div className="mt-4">
              <ImportSalesRecapForm action={importRekapAction} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
