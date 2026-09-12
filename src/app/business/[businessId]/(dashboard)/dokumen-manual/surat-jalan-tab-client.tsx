"use client";

import { useState } from "react";
import SuratJalanManualForm from "../lokasi/[locationId]/dokumen-manual/surat-jalan-form";
import type { ManualDocOnSuccess } from "../lokasi/[locationId]/dokumen-manual/manual-doc-form";
import DocPreviewModal, { type PreviewDoc } from "./doc-preview-modal";
import BlankFormModal from "./blank-form-modal";
import { getManualDeliveryNoteDetail } from "./actions";

export type HistoryEntry = { id: string; docNumber: string; contextLine: string; createdByName: string | null; createdAt: string };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SuratJalanTabClient({
  businessId,
  businessName,
  history,
}: {
  businessId: string;
  businessName: string;
  history: HistoryEntry[];
}) {
  const [preview, setPreview] = useState<PreviewDoc | null>(null);
  const [blankOpen, setBlankOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleSuccess: ManualDocOnSuccess = (doc) => {
    setPreview({
      type: "surat-jalan",
      docNumber: doc.docNumber ?? "",
      createdAt: doc.createdAt ?? new Date().toISOString(),
      businessName,
      context: doc.context,
      note: doc.note,
      items: doc.items,
      receiveCode: doc.receiveCode,
    });
  };

  async function handleHistoryClick(id: string) {
    setLoadingId(id);
    const detail = await getManualDeliveryNoteDetail(businessId, id);
    setLoadingId(null);
    if (detail) setPreview(detail);
  }

  return (
    <>
      <SuratJalanManualForm businessId={businessId} locationId={null} onSuccess={handleSuccess} />

      <div className="mt-3 text-right">
        <button onClick={() => setBlankOpen(true)} className="text-xs font-medium text-brand-600 hover:underline">
          🖨️ Cetak Formulir Kosong (isi tangan)
        </button>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Riwayat Surat Jalan</h2>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada Surat Jalan manual yang dibuat.
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((e) => (
              <button
                key={e.id}
                onClick={() => handleHistoryClick(e.id)}
                disabled={loadingId === e.id}
                className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left hover:border-brand-300 disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900">{e.docNumber}</p>
                  <p className="text-[10.5px] text-zinc-400">
                    {loadingId === e.id ? "Memuat…" : formatDateTime(e.createdAt)}
                  </p>
                </div>
                <p className="text-xs text-zinc-500">{e.contextLine}</p>
                {e.createdByName && <p className="text-[10.5px] text-zinc-400">Oleh {e.createdByName}</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {preview && <DocPreviewModal doc={preview} onClose={() => setPreview(null)} />}
      {blankOpen && (
        <BlankFormModal
          businessName={businessName}
          title="Surat Jalan"
          fields={["Tanggal", "Tujuan Pengiriman"]}
          signLabels={["Dikirim oleh", "Diterima oleh"]}
          onClose={() => setBlankOpen(false)}
        />
      )}
    </>
  );
}
