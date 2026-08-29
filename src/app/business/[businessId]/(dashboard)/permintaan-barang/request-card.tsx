"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteRequest, receivePurchaseRequest } from "./actions";
import ItemRow from "./item-row";
import SupplierGroup from "./supplier-group";

type Supplier = { id: string; name: string; phone: string | null };
type Employee = { id: string; name: string };
type Allocation = {
  id: string;
  supplierId: string | null;
  qty: number;
  forwardedAt: string | null;
  receivedAt: string | null;
  purchaseId: string | null;
};
type StockFulfillment = { qty: number; markedAt: string; receivedAt: string | null };
type PoInfo = {
  id: string;
  poNumber: string;
  supplierId: string | null;
  status: string;
  totalAmount: number;
  createdAt: string;
};
type RequestItem = {
  id: string;
  itemName: string;
  itemType: "ingredient" | "product";
  ingredientId: string | null;
  productId: string | null;
  department: string | null;
  unit: string | null;
  qtyOrdered: number;
  currentStock: number | null;
  totalStock: number | null;
  approvedQty: number | null;
  budgetStatus: string;
  budgetApprovedBy: string | null;
  budgetNote: string | null;
  fulfillmentSource: "pending" | "stock" | "supplier";
  stockFulfillment: StockFulfillment | null;
  defaultUnitPrice: number;
  allocations: Allocation[];
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

export default function RequestCard({
  businessId,
  businessName,
  request,
  suppliers,
  employees,
  costControlEnabled,
  procurementBudgetGateEnabled,
  purchaseOrders,
}: {
  businessId: string;
  businessName: string;
  purchaseOrders: PoInfo[];
  request: {
    id: string;
    employeeName: string;
    locationName: string | null;
    status: "baru" | "diterima" | "diteruskan";
    note: string | null;
    createdAt: string;
    prNumber: string | null;
    estimatedValue: number;
    items: RequestItem[];
  };
  suppliers: Supplier[];
  employees: Employee[];
  costControlEnabled: boolean;
  procurementBudgetGateEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState(false);

  function handleReceive() {
    setError(null);
    setPending(true);
    receivePurchaseRequest(businessId, request.id)
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

  function handleDeleteRequest() {
    setError(null);
    setPending(true);
    deleteRequest(businessId, request.id)
      .then((res) => {
        setPending(false);
        setConfirmDeleteRequest(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setConfirmDeleteRequest(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  const STATUS_LABEL: Record<typeof request.status, string> = {
    baru: "Baru masuk",
    diterima: "Diterima",
    diteruskan: "Semua diteruskan",
  };
  const STATUS_STYLE: Record<typeof request.status, string> = {
    baru: "border-amber-500 bg-amber-50 text-amber-700",
    diterima: "border-blue-500 bg-blue-50 text-blue-700",
    diteruskan: "border-brand-600 bg-brand-50 text-brand-700",
  };

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

  // Alokasi yang sudah punya supplier tapi belum diteruskan, dikelompokkan
  // per supplier lintas SEMUA barang di order ini — biar "Teruskan" itu satu
  // kali per supplier (satu WA), bukan satu kali per barang/alokasi.
  const readyGroups = new Map<
    string,
    { allocationId: string; itemName: string; unit: string | null; qty: number; defaultUnitPrice: number }[]
  >();
  for (const item of request.items) {
    for (const a of item.allocations) {
      if (a.supplierId && !a.forwardedAt) {
        const list = readyGroups.get(a.supplierId) ?? [];
        list.push({
          allocationId: a.id,
          itemName: item.itemName,
          unit: item.unit,
          qty: a.qty,
          defaultUnitPrice: item.defaultUnitPrice,
        });
        readyGroups.set(a.supplierId, list);
      }
    }
  }

  // Ringkasan approval budget PER ITEM ("per item barang, PR terkoreksi") —
  // cuma relevan/ditampilkan kalau gerbang budget lagi aktif.
  const approvedCount = request.items.filter((it) => it.budgetStatus === "approved_in_budget").length;
  const rejectedCount = request.items.filter((it) => it.budgetStatus === "rejected").length;
  const allDecided = request.items.length > 0 && approvedCount + rejectedCount === request.items.length;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {request.employeeName}
            {request.locationName && (
              <span className="ml-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                📍 {request.locationName}
              </span>
            )}
          </p>
          <p className="text-[11px] text-zinc-400">
            {formatDateTime(request.createdAt)}
            {request.prNumber && (
              <>
                {" · "}
                <Link
                  href={`/business/${businessId}/permintaan-barang/${request.id}`}
                  className="font-medium text-brand-600 hover:underline"
                >
                  🖨️ {request.prNumber}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {costControlEnabled && procurementBudgetGateEnabled && (
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                allDecided
                  ? rejectedCount > 0
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-amber-500 bg-amber-50 text-amber-700"
              }`}
            >
              Budget: {approvedCount}/{request.items.length} disetujui
            </span>
          )}
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[request.status]}`}
          >
            {STATUS_LABEL[request.status]}
          </span>
          {confirmDeleteRequest ? (
            <span className="flex items-center gap-1.5 text-[11px]">
              <button
                onClick={handleDeleteRequest}
                disabled={pending}
                className="font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                Ya, hapus
              </button>
              <button
                onClick={() => setConfirmDeleteRequest(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                Batal
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDeleteRequest(true)}
              className="text-[11px] text-zinc-400 hover:text-red-600"
              title="Hapus order ini"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {costControlEnabled && procurementBudgetGateEnabled && (
        <p className="mt-2 text-[11px] text-zinc-400">Estimasi nilai PR: {request.estimatedValue.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })}</p>
      )}

      <div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-100">
        {request.items.map((it) => (
          <ItemRow
            key={it.id}
            businessId={businessId}
            suppliers={suppliers}
            employees={employees}
            costControlEnabled={costControlEnabled}
            procurementBudgetGateEnabled={procurementBudgetGateEnabled}
            item={it}
          />
        ))}
      </div>

      {readyGroups.size > 0 && (
        <div className="mt-3 space-y-2">
          {Array.from(readyGroups.entries()).map(([supplierId, allocations]) => {
            const supplier = supplierMap.get(supplierId);
            if (!supplier) return null;
            return (
              <SupplierGroup
                key={supplierId}
                businessId={businessId}
                requestId={request.id}
                businessName={businessName}
                employeeName={request.employeeName}
                createdAt={request.createdAt}
                supplier={supplier}
                allocations={allocations}
                costControlEnabled={costControlEnabled}
                employees={employees}
                existingPos={purchaseOrders.filter((po) => po.supplierId === supplierId)}
              />
            );
          })}
        </div>
      )}

      {request.note && <p className="mt-2 text-xs italic text-zinc-500">Catatan: {request.note}</p>}

      {request.status === "baru" && (
        <div className="mt-3">
          <button
            onClick={handleReceive}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? "Memproses…" : "Terima Order"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
