"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "./actions";
import { rejectWarehouseRequest } from "./actions";

const initialState: ActionState = { error: null };

const STATUS_BADGE: Record<string, string> = {
  baru: "bg-amber-50 text-amber-700",
  disiapkan: "bg-emerald-50 text-emerald-700",
  ditolak: "bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  baru: "Baru",
  disiapkan: "Disiapkan",
  ditolak: "Ditolak",
};

export default function RequestCard({
  businessId,
  request,
  fulfillAction,
}: {
  businessId: string;
  request: {
    id: string;
    warehouse_name: string;
    employee_name: string;
    note: string | null;
    status: string;
    reject_reason: string | null;
    created_at: string;
    items: { id: string; item_name: string; unit: string; qty_requested: number; qty_fulfilled: number | null }[];
  };
  fulfillAction: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(fulfillAction, initialState);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [rejectPending, setRejectPending] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{request.warehouse_name}</p>
          <p className="text-xs text-zinc-500">
            {new Date(request.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
            {" · "}
            {request.employee_name}
            {request.note && ` · ${request.note}`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[request.status]}`}>
          {STATUS_LABEL[request.status]}
        </span>
      </div>

      {request.status === "baru" ? (
        <form action={formAction} className="mt-3 space-y-2">
          <div className="space-y-1.5">
            {request.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-1.5">
                <span className="text-xs text-zinc-600">
                  {item.item_name} · diminta {item.qty_requested} {item.unit}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name={`qty:${item.id}`}
                  defaultValue={item.qty_requested}
                  className="w-24 rounded-lg border border-zinc-200 px-2 py-1 text-right text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            ))}
          </div>

          {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}

          {!rejecting ? (
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-xl bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Memproses…" : "Siapkan"}
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Tolak
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Alasan penolakan (wajib)"
                className="w-full rounded-lg border border-red-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-200"
              />
              {rejectError && <p className="text-xs text-red-600">{rejectError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setRejectPending(true);
                    setRejectError(null);
                    try {
                      const result = await rejectWarehouseRequest(businessId, request.id, reason);
                      setRejectPending(false);
                      if (result.error) {
                        setRejectError(result.error);
                        return;
                      }
                      router.refresh();
                    } catch {
                      setRejectPending(false);
                      setRejectError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
                    }
                  }}
                  disabled={rejectPending}
                  className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rejectPending ? "Menolak…" : "Ya, Tolak"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejecting(false);
                    setRejectError(null);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </form>
      ) : (
        <div className="mt-3 space-y-1.5">
          {request.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-xs text-zinc-600">
              <span>{item.item_name}</span>
              <span>
                {request.status === "disiapkan"
                  ? `${item.qty_fulfilled ?? item.qty_requested} ${item.unit}`
                  : `diminta ${item.qty_requested} ${item.unit}`}
              </span>
            </div>
          ))}
          {request.status === "ditolak" && request.reject_reason && (
            <p className="text-xs text-red-500">Alasan: {request.reject_reason}</p>
          )}
        </div>
      )}
    </div>
  );
}
