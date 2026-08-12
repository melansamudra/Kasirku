"use client";

import { useActionState } from "react";
import {
  previewMokaImport,
  importFromMoka,
  type MokaPreviewState,
  type MokaImportState,
} from "./actions";

const initPreview: MokaPreviewState = { error: null, preview: null };
const initImport: MokaImportState = { error: null, result: null };

export default function ImportMokaForm({
  businessId,
  onClose,
}: {
  businessId: string;
  onClose: () => void;
}) {
  const [previewState, previewAction, isPreviewing] = useActionState(
    previewMokaImport.bind(null, businessId),
    initPreview,
  );
  const [importState, importAction, isImporting] = useActionState(
    importFromMoka.bind(null, businessId),
    initImport,
  );

  // Langkah 3: Selesai
  if (importState.result) {
    const { created, skipped, errors } = importState.result;
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-50 px-4 py-3">
          <p className="text-sm font-semibold text-brand-700">
            ✅ {created} transaksi berhasil diimpor
          </p>
          {skipped > 0 && (
            <p className="mt-0.5 text-xs text-zinc-500">{skipped} transaksi dilewati</p>
          )}
        </div>
        {errors.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-600">Detail yang dilewati:</p>
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-red-500">{e}</p>
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

  // Langkah 2: Preview
  if (previewState.preview) {
    const { matched, unmatched, willImport, willSkip, txJson } = previewState.preview;
    return (
      <div className="space-y-4">
        {/* Ringkasan */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-brand-700">{willImport}</p>
            <p className="text-xs text-brand-600">transaksi akan masuk</p>
          </div>
          <div className={`rounded-xl px-3 py-2.5 text-center ${willSkip > 0 ? "bg-amber-50" : "bg-zinc-50"}`}>
            <p className={`text-lg font-bold ${willSkip > 0 ? "text-amber-600" : "text-zinc-400"}`}>{willSkip}</p>
            <p className={`text-xs ${willSkip > 0 ? "text-amber-500" : "text-zinc-400"}`}>transaksi dilewati</p>
          </div>
        </div>

        {/* Produk tidak ditemukan */}
        {unmatched.length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-3">
            <p className="mb-1.5 text-xs font-semibold text-red-600">
              ❌ Produk tidak ditemukan ({unmatched.length}) — transaksi dengan produk ini dilewati:
            </p>
            <div className="max-h-28 space-y-0.5 overflow-y-auto">
              {unmatched.map((n) => (
                <p key={n} className="text-xs text-red-500">{n}</p>
              ))}
            </div>
          </div>
        )}

        {/* Produk cocok */}
        {matched.length > 0 && (
          <details className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-zinc-500">
              ✅ Produk ditemukan ({matched.length}) — klik untuk lihat
            </summary>
            <div className="mt-2 max-h-28 space-y-0.5 overflow-y-auto">
              {matched.map((n) => (
                <p key={n} className="text-xs text-zinc-600">{n}</p>
              ))}
            </div>
          </details>
        )}

        {willImport === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⚠️ Tidak ada transaksi yang bisa diimpor. Samakan nama produk di KasirKu dengan nama di file Moka terlebih dahulu.
          </p>
        )}

        {/* Tombol aksi */}
        <div className="flex gap-2">
          <form action={importAction} className="flex-1">
            <input type="hidden" name="txJson" value={txJson} />
            <button
              type="submit"
              disabled={isImporting || willImport === 0}
              className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isImporting ? "Mengimpor..." : `Impor ${willImport} Transaksi`}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Langkah 1: Upload
  return (
    <form action={previewAction} className="space-y-4">
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-4">
        <p className="mb-2 text-xs font-medium text-zinc-600">Upload file ekspor Moka POS (.csv / .tsv)</p>
        <input
          type="file"
          name="file"
          accept=".csv,.tsv,.txt"
          required
          className="w-full text-xs text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 file:shadow-sm"
        />
      </div>
      <p className="text-xs text-zinc-400">
        Sistem akan cek nama produk di file vs KasirKu sebelum mengimpor.
      </p>
      {previewState.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{previewState.error}</p>
      )}
      <button
        type="submit"
        disabled={isPreviewing}
        className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {isPreviewing ? "Menganalisis file..." : "Analisis File"}
      </button>
    </form>
  );
}
