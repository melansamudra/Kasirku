"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import BlankFormPrint from "../lokasi/[locationId]/dokumen-manual/blank-form-print";

// Sama alasannya dengan doc-preview-modal.tsx -- formulir kosong dulunya
// halaman /kosong/... terpisah, sekarang inline modal supaya tidak
// bergantung ke routing yang bermasalah di production. Di-portal ke
// document.body + toggle class body.doc-modal-printing (globals.css)
// supaya cetak tidak ikut mencetak seluruh halaman di belakangnya.
export default function BlankFormModal({
  businessName,
  title,
  fields,
  qtyColumnLabel,
  signLabels,
  onClose,
}: {
  businessName: string;
  title: string;
  fields: string[];
  qtyColumnLabel?: string;
  signLabels: [string, string];
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("doc-modal-printing");
    return () => document.body.classList.remove("doc-modal-printing");
  }, []);

  return createPortal(
    <div
      id="doc-modal-print-root"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 print:static print:bg-transparent print:p-0"
    >
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-end print:hidden">
          <button onClick={onClose} className="text-zinc-100 hover:text-white">
            ✕ Tutup
          </button>
        </div>
        <BlankFormPrint
          businessName={businessName}
          locationName={businessName}
          title={title}
          fields={fields}
          qtyColumnLabel={qtyColumnLabel}
          signLabels={signLabels}
        />
        <div className="mt-3 flex gap-2 print:hidden">
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
            🖨️ Cetak Formulir Kosong
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
