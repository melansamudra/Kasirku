"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approvePurchaseOrder, rejectPurchaseOrder } from "../actions";

export default function ApproveForm({
  businessId,
  poId,
  approvalLabel,
  actorName,
  canApprove,
  blockedReason,
}: {
  businessId: string;
  poId: string;
  approvalLabel: string;
  actorName: string;
  canApprove: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    setPending(true);
    approvePurchaseOrder(businessId, poId)
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  function handleReject() {
    setError(null);
    setPending(true);
    rejectPurchaseOrder(businessId, poId, reason)
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 print:hidden">
      <p className="text-[11px] font-semibold text-amber-800">Otorisasi Formal PO — {approvalLabel}</p>
      {!canApprove ? (
        <p className="mt-2 text-[11px] text-amber-700">
          Akun Anda tidak punya izin Setujui PO. Minta Owner aktifkan permission &quot;Setujui PO&quot; di Kelola
          Admin.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-600">
            Masuk sebagai <span className="font-semibold text-zinc-800">{actorName}</span>
          </span>
          {blockedReason ? (
            <span className="text-[11px] text-amber-700">{blockedReason}</span>
          ) : (
            <button
              onClick={handleApprove}
              disabled={pending}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              ✓ Setujui PO
            </button>
          )}
          {showReject ? (
            <span className="flex items-center gap-1.5">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Alasan penolakan…"
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] focus:border-brand-600 focus:outline-none"
              />
              <button
                onClick={handleReject}
                disabled={pending}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Kirim Penolakan
              </button>
            </span>
          ) : (
            <button onClick={() => setShowReject(true)} className="text-[11px] text-zinc-500 hover:text-red-600">
              Tolak PO
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
