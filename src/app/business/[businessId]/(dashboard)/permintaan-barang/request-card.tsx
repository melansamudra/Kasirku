"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignPurchaseRequestSupplier,
  forwardPurchaseRequestToSupplier,
  receivePurchaseRequest,
} from "./actions";

type Supplier = { id: string; name: string; phone: string | null };
type RequestItem = {
  id: string;
  itemName: string;
  unit: string | null;
  qtyOrdered: number;
  currentStock: number | null;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Normalisasi kasar nomor HP Indonesia ke format internasional buat wa.me —
// staf/owner biasanya isi nomor supplier diawali 0, wa.me butuh kode negara.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return `62${digits}`;
}

function buildWaText(
  businessName: string,
  employeeName: string,
  createdAt: string,
  note: string | null,
  items: RequestItem[],
): string {
  const lines: string[] = [];
  lines.push(`*Order Barang — ${businessName}*`);
  lines.push(`Dari: ${employeeName}`);
  lines.push(`Tanggal: ${formatDateTime(createdAt)}`);
  lines.push("");
  lines.push("Daftar barang:");
  items.forEach((it, idx) => {
    lines.push(`${idx + 1}. ${it.itemName} — ${it.qtyOrdered}${it.unit ? ` ${it.unit}` : ""}`);
  });
  if (note) {
    lines.push("");
    lines.push(`Catatan: ${note}`);
  }
  return lines.join("\n");
}

export default function RequestCard({
  businessId,
  businessName,
  request,
  suppliers,
}: {
  businessId: string;
  businessName: string;
  request: {
    id: string;
    employeeName: string;
    status: "baru" | "diterima" | "diteruskan";
    supplierId: string | null;
    note: string | null;
    createdAt: string;
    items: RequestItem[];
  };
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState(request.supplierId ?? "");

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const selectedSupplier = supplierId ? supplierMap.get(supplierId) : undefined;

  function handleReceive() {
    setError(null);
    setPending(true);
    receivePurchaseRequest(businessId, request.id).then((res) => {
      setPending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleForward() {
    setError(null);
    if (!supplierId) {
      setError("Pilih supplier dulu.");
      return;
    }
    setPending(true);
    assignPurchaseRequestSupplier(businessId, request.id, supplierId)
      .then((res) => {
        if (res.error) throw new Error(res.error);
        return forwardPurchaseRequestToSupplier(businessId, request.id);
      })
      .then((res) => {
        setPending(false);
        if (res?.error) {
          setError(res.error);
          return;
        }
        router.refresh();
      })
      .catch((e: Error) => {
        setPending(false);
        setError(e.message);
      });
  }

  const waText = buildWaText(businessName, request.employeeName, request.createdAt, request.note, request.items);
  const waHref = selectedSupplier?.phone
    ? `https://wa.me/${normalizePhone(selectedSupplier.phone)}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const STATUS_LABEL: Record<typeof request.status, string> = {
    baru: "Baru masuk",
    diterima: "Diterima",
    diteruskan: "Diteruskan",
  };
  const STATUS_STYLE: Record<typeof request.status, string> = {
    baru: "border-amber-500 bg-amber-50 text-amber-700",
    diterima: "border-blue-500 bg-blue-50 text-blue-700",
    diteruskan: "border-brand-600 bg-brand-50 text-brand-700",
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{request.employeeName}</p>
          <p className="text-[11px] text-zinc-400">{formatDateTime(request.createdAt)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[request.status]}`}
        >
          {STATUS_LABEL[request.status]}
        </span>
      </div>

      <div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-100">
        {request.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <p className="text-zinc-800">{it.itemName}</p>
            <div className="text-right">
              <p className="font-medium text-zinc-900">
                {it.qtyOrdered}
                {it.unit ? ` ${it.unit}` : ""}
              </p>
              {it.currentStock !== null && (
                <p className="text-[10.5px] text-zinc-400">Stok saat ini: {it.currentStock}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {request.note && <p className="mt-2 text-xs italic text-zinc-500">Catatan: {request.note}</p>}

      <div className="mt-3">
        {request.status === "baru" && (
          <button
            onClick={handleReceive}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? "Memproses…" : "Terima Order"}
          </button>
        )}

        {request.status === "diterima" && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">— Pilih supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleForward}
              disabled={pending || !supplierId}
              className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? "Memproses…" : "Teruskan ke Supplier"}
            </button>
          </div>
        )}

        {request.status === "diteruskan" && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-zinc-500">
              Supplier: <span className="font-medium text-zinc-800">{selectedSupplier?.name ?? "—"}</span>
            </p>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Kirim WhatsApp
            </a>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
