"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { forwardAllocationsToSupplier } from "./actions";

const PO_STATUS_LABEL: Record<string, string> = {
  issued: "Menunggu Approval",
  approved: "Approved",
  rejected: "Ditolak",
};
const PO_STATUS_STYLE: Record<string, string> = {
  issued: "bg-amber-50 text-amber-700",
  approved: "bg-brand-50 text-brand-700",
  rejected: "bg-red-50 text-red-700",
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
type PoInfo = {
  id: string;
  poNumber: string;
  supplierId: string | null;
  status: string;
  totalAmount: number;
  createdAt: string;
};

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
  existingPos = [],
}: {
  businessId: string;
  requestId: string;
  businessName: string;
  employeeName: string;
  createdAt: string;
  supplier: { id: string; name: string; phone: string | null };
  allocations: GroupAllocation[];
  costControlEnabled?: boolean;
  existingPos?: PoInfo[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sengaja DIKOSONGKAN, bukan prefill dari harga bahan baku tersimpan
  // (ingredients.unit_cost) -- staf harus selalu ketik/konfirmasi harga
  // kesepakatan aktual dengan supplier, biar tidak diam-diam terkirim
  // harga lama tanpa disadari. Tombol "pakai" di sebelah tiap baris kasih
  // jalan pintas kalau harganya memang masih sama.
  const [prices, setPrices] = useState<Record<string, string>>({});

  const total = allocations.reduce((sum, a) => sum + a.qty * (Number(prices[a.allocationId]) || 0), 0);

  function handleForward() {
    if (costControlEnabled) {
      const missing = allocations.some((a) => !(Number(prices[a.allocationId]) > 0));
      if (missing) {
        setError("Isi harga setiap barang dulu (tidak boleh kosong/0).");
        return;
      }
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

  const openPo = existingPos.find((po) => po.status === "issued");
  const sortedHistory = [...existingPos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
      <p className="text-xs font-semibold text-zinc-900">Ke: {supplier.name}</p>
      {costControlEnabled && openPo && (
        <p className="mt-1 text-[11px] text-zinc-500">
          📄 Barang ini akan ditambahkan ke{" "}
          <Link
            href={`/business/${businessId}/purchase-orders/${openPo.id}`}
            className="font-medium text-brand-600 hover:underline"
          >
            {openPo.poNumber}
          </Link>{" "}
          yang belum di-approve — bukan bikin PO baru.
        </p>
      )}
      {costControlEnabled ? (
        <div className="mt-1.5 space-y-1">
          {allocations.map((a) => {
            const filled = Number(prices[a.allocationId]) > 0;
            return (
              <div key={a.allocationId} className="text-[12px] text-zinc-600">
                <div className="flex items-center justify-between gap-2">
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
                      placeholder="wajib diisi"
                      className={`w-24 rounded-lg border px-1.5 py-1 text-right text-[11px] focus:outline-none ${
                        filled
                          ? "border-zinc-200 focus:border-brand-600"
                          : "border-amber-300 bg-amber-50 focus:border-amber-500"
                      }`}
                    />
                  </span>
                </div>
                {!filled && a.defaultUnitPrice > 0 && (
                  <p className="mt-0.5 text-right text-[10.5px] text-amber-600">
                    Harga bahan tersimpan: {formatRupiah(a.defaultUnitPrice)} — belum tentu sama
                    dengan harga {supplier.name} sekarang.{" "}
                    <button
                      type="button"
                      onClick={() =>
                        setPrices((prev) => ({ ...prev, [a.allocationId]: String(a.defaultUnitPrice) }))
                      }
                      className="font-semibold underline hover:text-amber-700"
                    >
                      Pakai harga ini
                    </button>
                  </p>
                )}
              </div>
            );
          })}
          <p className="pt-1 text-right text-[11px] font-semibold text-zinc-700">
            Total PO: {formatRupiah(total)}
          </p>
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

      {costControlEnabled && sortedHistory.length > 0 && (
        <div className="mt-2 border-t border-brand-100 pt-2">
          <p className="text-[10.5px] font-medium text-zinc-500">Riwayat PO ke {supplier.name} dari order ini</p>
          <div className="mt-1 space-y-1">
            {sortedHistory.map((po) => (
              <Link
                key={po.id}
                href={`/business/${businessId}/purchase-orders/${po.id}`}
                className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1 text-[11px] hover:shadow-sm"
              >
                <span className="font-medium text-zinc-700">{po.poNumber}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-zinc-400">Rp{Math.round(po.totalAmount).toLocaleString("id-ID")}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PO_STATUS_STYLE[po.status]}`}>
                    {PO_STATUS_LABEL[po.status] ?? po.status}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
