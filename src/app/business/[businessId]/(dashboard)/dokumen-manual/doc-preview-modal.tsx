"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Preview + cetak dokumen manual INLINE (modal), bukan navigasi ke halaman
// [docId] terpisah -- rute itu sempat 404 terus-menerus di production
// walau data & kode sudah dicek benar dan deploy sukses (sebab pastinya
// tidak ketemu). Daripada bergantung ke routing yang bermasalah, preview
// dirender langsung dari data yang sudah ada di tangan (baru disimpan,
// atau di-fetch sekali lewat getManualDocDetail) dan dicetak lewat
// window.print() di komponen ini juga.
//
// Di-portal ke document.body (bukan dirender di tempat) + toggle class
// body.doc-modal-printing (lihat globals.css) supaya pas dicetak, browser
// tidak ikut mencetak seluruh halaman Dokumen Manual di belakangnya
// (form/tab/riwayat) -- sebelumnya print preview menampilkan semuanya
// numpuk jadi 1 halaman panjang karena modal ini cuma overlay biasa,
// bukan halaman print tersendiri.

export type PreviewDoc = {
  type: "surat-jalan" | "permintaan-barang" | "stock-opname";
  docNumber: string;
  createdAt: string;
  businessName: string;
  context: string;
  note: string;
  items: { itemName: string; unit: string; qty: number }[];
  receiveCode?: string;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TITLES: Record<PreviewDoc["type"], string> = {
  "surat-jalan": "SURAT JALAN",
  "permintaan-barang": "PERMINTAAN BARANG",
  "stock-opname": "STOCK OPNAME",
};

const SIGN_LABELS: Record<PreviewDoc["type"], [string, string]> = {
  "surat-jalan": ["Dikirim oleh", "Diterima oleh"],
  "permintaan-barang": ["Diminta oleh", "Diterima Purchasing"],
  "stock-opname": ["Dihitung oleh", "Diperiksa oleh"],
};

const QTY_LABEL: Record<PreviewDoc["type"], string> = {
  "surat-jalan": "Qty",
  "permintaan-barang": "Qty",
  "stock-opname": "Qty Fisik",
};

export default function DocPreviewModal({ doc, onClose }: { doc: PreviewDoc; onClose: () => void }) {
  const [signLabel1, signLabel2] = SIGN_LABELS[doc.type];

  useEffect(() => {
    document.body.classList.add("doc-modal-printing");
    return () => document.body.classList.remove("doc-modal-printing");
  }, []);

  return createPortal(
    <div
      id="doc-modal-print-root"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 print:static print:bg-transparent print:p-0"
    >
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-lg print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="flex items-center justify-between print:hidden">
          <p className="text-xs font-medium text-zinc-400">{doc.businessName}</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>

        <div className="mt-4 print:mt-0">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-zinc-900">{TITLES[doc.type]}</h1>
              <p className="text-xs text-zinc-400">{doc.docNumber}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-zinc-400">{doc.type === "surat-jalan" ? "Dari" : "Toko"}</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{doc.businessName}</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-400">Tanggal</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{formatDateTime(doc.createdAt)}</p>
            </div>
          </div>

          {doc.type === "surat-jalan" && (
            <div className="mt-3 text-xs">
              <p className="text-zinc-400">Tujuan Pengiriman</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{doc.context}</p>
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Barang</th>
                  <th className="px-3 py-2 text-right font-medium">{QTY_LABEL[doc.type]}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {doc.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-zinc-700">{it.itemName}</td>
                    <td className="px-3 py-2 text-right text-zinc-500">
                      {it.qty} {it.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {doc.note && <p className="mt-3 text-xs text-zinc-500">Catatan: {doc.note}</p>}

          {doc.type === "surat-jalan" && doc.receiveCode && (
            <div className="mt-4 rounded-lg border border-dashed border-zinc-300 px-3 py-2.5 text-xs">
              <p className="text-zinc-400">
                Kode Terima{" "}
                <span className="print:hidden">
                  (dipakai penerima di menu Pembelian &amp; Hutang, bagian &quot;Terima dari Surat Jalan&quot;)
                </span>
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold tracking-wider text-zinc-900">{doc.receiveCode}</p>
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-zinc-400">{signLabel1}</p>
              <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">________________</p>
            </div>
            <div>
              <p className="text-zinc-400">{signLabel2}</p>
              <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">________________</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2 print:hidden">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            ← Kembali
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            🖨️ Cetak
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
