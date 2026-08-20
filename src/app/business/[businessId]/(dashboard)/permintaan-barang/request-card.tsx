"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { receivePurchaseRequest } from "./actions";
import ItemRow from "./item-row";
import SupplierGroup from "./supplier-group";

type Supplier = { id: string; name: string; phone: string | null };
type Allocation = {
  id: string;
  supplierId: string | null;
  qty: number;
  forwardedAt: string | null;
  receivedAt: string | null;
  purchaseId: string | null;
};
type RequestItem = {
  id: string;
  itemName: string;
  itemType: "ingredient" | "product";
  ingredientId: string | null;
  productId: string | null;
  unit: string | null;
  qtyOrdered: number;
  currentStock: number | null;
  approvedQty: number | null;
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
}: {
  businessId: string;
  businessName: string;
  request: {
    id: string;
    employeeName: string;
    status: "baru" | "diterima" | "diteruskan";
    note: string | null;
    createdAt: string;
    items: RequestItem[];
  };
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    { allocationId: string; itemName: string; unit: string | null; qty: number }[]
  >();
  for (const item of request.items) {
    for (const a of item.allocations) {
      if (a.supplierId && !a.forwardedAt) {
        const list = readyGroups.get(a.supplierId) ?? [];
        list.push({ allocationId: a.id, itemName: item.itemName, unit: item.unit, qty: a.qty });
        readyGroups.set(a.supplierId, list);
      }
    }
  }

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
        {request.status === "baru"
          ? request.items.map((it) => (
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
            ))
          : request.items.map((it) => <ItemRow key={it.id} businessId={businessId} suppliers={suppliers} item={it} />)}
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
