"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verifySupplierDebtNote, deleteSupplierDebtNote } from "./actions";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DebtNoteCard({
  businessId,
  note,
}: {
  businessId: string;
  note: {
    id: string;
    supplierName: string | null;
    category: string;
    amount: number;
    note: string | null;
    receiptUrl: string | null;
    createdAt: string;
    origin: "kasir" | "admin";
    cashierName: string | null;
    supplierId: string | null;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleVerifyAndRedirect() {
    setError(null);
    setPending(true);
    verifySupplierDebtNote(businessId, note.id).then((res) => {
      setPending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      const params = new URLSearchParams({
        prefillAmount: String(note.amount),
        prefillCategory: note.category === "Bahan Baku" ? "Bahan Baku" : "",
      });
      if (note.supplierId) params.set("prefillSupplierId", note.supplierId);
      const noteParts = [note.supplierName ? `Supplier: ${note.supplierName}` : null, note.note].filter(Boolean);
      if (noteParts.length > 0) params.set("prefillNote", noteParts.join(" — "));
      router.push(`/business/${businessId}/purchases?${params.toString()}`);
    });
  }

  function handleDelete() {
    setError(null);
    setPending(true);
    deleteSupplierDebtNote(businessId, note.id).then((res) => {
      setPending(false);
      setConfirmDelete(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{note.supplierName ?? "Supplier belum diketahui"}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
            <span>{formatDateTime(note.createdAt)}</span>
            <span>·</span>
            <span>{note.origin === "admin" ? "Input Admin" : note.cashierName ?? "Kasir"}</span>
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600">
              {note.category}
            </span>
            {note.receiptUrl && (
              <a
                href={note.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 hover:bg-amber-100"
              >
                🧾 Lihat Nota
              </a>
            )}
          </div>
          {note.note && <p className="mt-1.5 text-xs text-zinc-500">{note.note}</p>}
        </div>
        <p className="shrink-0 text-sm font-bold text-red-600">{formatRupiah(note.amount)}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleVerifyAndRedirect}
          disabled={pending}
          className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Memproses…" : "✔️ Verifikasi & Alihkan ke Pembelian →"}
        </button>
        {confirmDelete ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
            <button
              onClick={handleDelete}
              disabled={pending}
              className="font-semibold text-red-600 hover:underline disabled:opacity-50"
            >
              Yakin hapus?
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-zinc-400 hover:text-zinc-600">
              Batal
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            title="Hapus nota ini"
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
          >
            🗑️
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
