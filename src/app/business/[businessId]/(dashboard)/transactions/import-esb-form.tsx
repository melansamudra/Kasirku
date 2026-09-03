"use client";

import { useActionState } from "react";
import type { EsbPreviewState, ImportEsbState } from "./esb-actions";

const initPreview: EsbPreviewState = { error: null, preview: null };
const initImport: ImportEsbState = { error: null, result: null };

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ImportEsbForm({
  previewAction: previewEsbAction,
  importAction: confirmEsbAction,
  onClose,
}: {
  previewAction: (state: EsbPreviewState, formData: FormData) => Promise<EsbPreviewState>;
  importAction: (state: ImportEsbState, formData: FormData) => Promise<ImportEsbState>;
  onClose: () => void;
}) {
  const [previewState, previewAction, isPreviewing] = useActionState(previewEsbAction, initPreview);
  const [importState, importAction, isImporting] = useActionState(confirmEsbAction, initImport);

  // Langkah 3: Selesai
  if (importState.result) {
    const { transactionCount, itemCount, createdProducts, skippedCount, warnings } = importState.result;
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-50 px-4 py-3">
          <p className="text-sm font-semibold text-brand-700">✅ {transactionCount} transaksi berhasil diimpor</p>
          <p className="mt-0.5 text-xs text-zinc-500">{itemCount} baris menu total.</p>
        </div>
        {createdProducts.length > 0 && (
          <p className="text-xs text-zinc-600">
            🆕 {createdProducts.length} produk baru dibuat: {createdProducts.join(", ")}.
          </p>
        )}
        {skippedCount > 0 && (
          <p className="text-xs text-amber-600">⚠ {skippedCount} transaksi dilewati (kemungkinan duplikat dari impor sebelumnya).</p>
        )}
        {warnings.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-amber-50 p-3">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700">{w}</p>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Selesai
        </button>
      </div>
    );
  }

  // Langkah 2: Preview -- belum ada yang tersimpan, cuma ringkasan rencana impor
  if (previewState.preview) {
    const { transactionCount, itemCount, totalRupiah, dateFrom, dateTo, newProductNames, matchedProductCount, warnings, dataJson } =
      previewState.preview;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-brand-700">{transactionCount}</p>
            <p className="text-xs text-brand-600">transaksi akan dibuat</p>
          </div>
          <div className="rounded-xl bg-zinc-50 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-zinc-700">{itemCount}</p>
            <p className="text-xs text-zinc-500">baris menu</p>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <div className="flex justify-between">
            <span>Tanggal</span>
            <span className="font-medium">
              {formatDate(dateFrom)}
              {dateFrom !== dateTo ? ` — ${formatDate(dateTo)}` : ""}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Total nilai (Subtotal+Layanan+PPN)</span>
            <span className="font-medium">{formatRupiah(totalRupiah)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Menu sudah cocok di katalog</span>
            <span className="font-medium">{matchedProductCount}</span>
          </div>
        </div>

        {newProductNames.length > 0 && (
          <details className="rounded-xl border border-amber-100 bg-amber-50 p-3" open>
            <summary className="cursor-pointer text-xs font-semibold text-amber-700">
              🆕 {newProductNames.length} menu BELUM ada di katalog — akan dibuat produk baru
            </summary>
            <p className="mt-1 text-[10.5px] text-amber-600">
              Cek dulu, siapa tahu ini sebenarnya menu yang sudah ada tapi beda ejaan/spasi — kalau iya,
              batalkan dulu &amp; benerin namanya di Kelola Produk biar tidak dobel.
            </p>
            <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto">
              {newProductNames.map((n, i) => (
                <p key={i} className="text-xs text-amber-700">
                  • {n}
                </p>
              ))}
            </div>
          </details>
        )}

        {warnings.length > 0 && (
          <details className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-zinc-600">
              ⚠️ {warnings.length} peringatan lain — klik untuk lihat
            </summary>
            <div className="mt-2 max-h-28 space-y-0.5 overflow-y-auto">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-zinc-600">
                  {w}
                </p>
              ))}
            </div>
          </details>
        )}

        {importState.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{importState.error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Batal
          </button>
          <form action={importAction} className="flex-1">
            <input type="hidden" name="dataJson" value={dataJson} />
            <button
              type="submit"
              disabled={isImporting || transactionCount === 0}
              className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isImporting ? "Mengimpor…" : `Konfirmasi Impor ${transactionCount} Transaksi`}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Langkah 1: Upload
  return (
    <form action={previewAction} className="space-y-3">
      <div>
        <label htmlFor="esb-file" className="mb-1 block text-xs font-medium text-zinc-600">
          File Excel ESB
        </label>
        <input
          id="esb-file"
          name="file"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          required
          className="w-full text-xs text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
        />
      </div>

      {previewState.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{previewState.error}</p>}

      <button
        type="submit"
        disabled={isPreviewing}
        className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPreviewing ? "Menganalisis file…" : "Analisis File"}
      </button>
    </form>
  );
}
