"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { forwardAllocationsToSupplier } from "./actions";

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
// nomor supplier biasanya diawali 0, wa.me butuh kode negara.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return `62${digits}`;
}

type GroupAllocation = {
  allocationId: string;
  itemName: string;
  unit: string | null;
  qty: number;
  defaultUnitPrice: number;
};
type Employee = { id: string; name: string };

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function SupplierGroup({
  businessId,
  requestId,
  businessName,
  employeeName,
  createdAt,
  supplier,
  allocations,
  costControlEnabled = false,
  employees = [],
}: {
  businessId: string;
  requestId: string;
  businessName: string;
  employeeName: string;
  createdAt: string;
  supplier: { id: string; name: string; phone: string | null };
  allocations: GroupAllocation[];
  costControlEnabled?: boolean;
  employees?: Employee[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(allocations.map((a) => [a.allocationId, String(a.defaultUnitPrice || "")])),
  );
  const [issuedBy, setIssuedBy] = useState("");

  const total = allocations.reduce((sum, a) => sum + a.qty * (Number(prices[a.allocationId]) || 0), 0);

  function handleForward() {
    if (costControlEnabled && !issuedBy) {
      setError("Pilih nama yang menerbitkan PO dulu.");
      return;
    }
    setError(null);
    setPending(true);
    const unitPrices = costControlEnabled
      ? Object.fromEntries(allocations.map((a) => [a.allocationId, Number(prices[a.allocationId]) || 0]))
      : undefined;
    forwardAllocationsToSupplier(
      businessId,
      requestId,
      allocations.map((a) => a.allocationId),
      unitPrices,
      costControlEnabled ? issuedBy : undefined,
    )
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }

        const waText = [
          `*Order Barang — ${businessName}*`,
          `Dari: ${employeeName}`,
          `Tanggal: ${formatDateTime(createdAt)}`,
          "",
          "Daftar barang:",
          ...allocations.map(
            (a, idx) => `${idx + 1}. ${a.itemName} — ${a.qty}${a.unit ? ` ${a.unit}` : ""}`,
          ),
        ].join("\n");
        const waHref = supplier.phone
          ? `https://wa.me/${normalizePhone(supplier.phone)}?text=${encodeURIComponent(waText)}`
          : `https://wa.me/?text=${encodeURIComponent(waText)}`;
        window.open(waHref, "_blank");
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
      <p className="text-xs font-semibold text-zinc-900">Ke: {supplier.name}</p>
      {costControlEnabled ? (
        <div className="mt-1.5 space-y-1">
          {allocations.map((a) => (
            <div key={a.allocationId} className="flex items-center justify-between gap-2 text-[12px] text-zinc-600">
              <span className="min-w-0 flex-1 truncate">
                {a.itemName} — {a.qty}
                {a.unit ? ` ${a.unit}` : ""}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="text-zinc-400">Rp</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={prices[a.allocationId] ?? ""}
                  onChange={(e) => setPrices((prev) => ({ ...prev, [a.allocationId]: e.target.value }))}
                  className="w-20 rounded-lg border border-zinc-200 px-1.5 py-1 text-right text-[11px] focus:border-brand-600 focus:outline-none"
                />
              </span>
            </div>
          ))}
          <p className="pt-1 text-right text-[11px] font-semibold text-zinc-700">
            Total PO: {formatRupiah(total)}
          </p>
          <select
            value={issuedBy}
            onChange={(e) => setIssuedBy(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[11px] focus:border-brand-600 focus:outline-none"
          >
            <option value="">— PO diterbitkan oleh —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.name}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {allocations.map((a) => (
            <li key={a.allocationId} className="text-[12px] text-zinc-600">
              {a.itemName} — {a.qty}
              {a.unit ? ` ${a.unit}` : ""}
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={handleForward}
        disabled={pending}
        className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {pending
          ? "Memproses…"
          : costControlEnabled
            ? `Terbitkan PO & Teruskan ke ${supplier.name}`
            : `Teruskan ${allocations.length} Barang ke ${supplier.name}`}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
