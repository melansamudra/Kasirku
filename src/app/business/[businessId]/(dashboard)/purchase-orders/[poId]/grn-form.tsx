"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGoodsReceiptNote, type GrnItemInput } from "../grn-actions";

type OutstandingItem = { poItemId: string; itemName: string; unit: string; remainingQty: number };

export default function GrnForm({
  businessId,
  poId,
  actorName,
  outstandingItems,
}: {
  businessId: string;
  poId: string;
  actorName: string;
  outstandingItems: OutstandingItem[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, { qty: string; condition: "ok" | "rejected"; note: string }>>(
    Object.fromEntries(
      outstandingItems.map((it) => [it.poItemId, { qty: String(it.remainingQty), condition: "ok" as const, note: "" }]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(poItemId: string, patch: Partial<{ qty: string; condition: "ok" | "rejected"; note: string }>) {
    setRows((prev) => ({ ...prev, [poItemId]: { ...prev[poItemId], ...patch } }));
  }

  function handleSubmit() {
    const items: GrnItemInput[] = outstandingItems.map((it) => {
      const row = rows[it.poItemId];
      return {
        poItemId: it.poItemId,
        qtyReceived: Number(row?.qty || 0),
        condition: row?.condition ?? "ok",
        conditionNote: row?.note,
      };
    });
    setError(null);
    setPending(true);
    createGoodsReceiptNote(businessId, poId, items)
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
      <p className="text-[11px] font-semibold text-amber-800">Catat Penerimaan Barang (GRN)</p>
      <p className="mt-0.5 text-[11px] text-amber-700">
        Isi qty yang benar-benar diterima fisik dan kondisinya. Boleh dicatat bertahap kalau pengiriman
        dari supplier parsial.
      </p>

      <div className="mt-3 space-y-2">
        {outstandingItems.map((it) => {
          const row = rows[it.poItemId];
          return (
            <div key={it.poItemId} className="rounded-lg bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-800">{it.itemName}</p>
                <p className="text-[10px] text-zinc-400">Sisa: {it.remainingQty} {it.unit}</p>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row?.qty ?? ""}
                  onChange={(e) => updateRow(it.poItemId, { qty: e.target.value })}
                  className="w-24 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
                />
                <span className="text-[11px] text-zinc-400">{it.unit}</span>
                <select
                  value={row?.condition ?? "ok"}
                  onChange={(e) => updateRow(it.poItemId, { condition: e.target.value as "ok" | "rejected" })}
                  className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
                >
                  <option value="ok">OK</option>
                  <option value="rejected">Rusak / Tolak</option>
                </select>
                {row?.condition === "rejected" && (
                  <input
                    type="text"
                    placeholder="Catatan kerusakan (wajib)…"
                    value={row?.note ?? ""}
                    onChange={(e) => updateRow(it.poItemId, { note: e.target.value })}
                    className="min-w-[160px] flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-zinc-600">
          Diterima oleh <span className="font-semibold text-zinc-800">{actorName}</span>
        </span>
        <button
          onClick={handleSubmit}
          disabled={pending}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Simpan Penerimaan"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
