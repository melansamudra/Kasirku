"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addItemAllocation,
  deleteItemAllocation,
  deleteRequestItem,
  markAllocationReceived,
  updateItemApprovedQty,
} from "./actions";

type Supplier = { id: string; name: string };
type Allocation = {
  id: string;
  supplierId: string | null;
  qty: number;
  forwardedAt: string | null;
  receivedAt: string | null;
  purchaseId: string | null;
};

const DEPARTMENT_LABELS: Record<string, string> = {
  dapur: "🍳 Dapur",
  bar: "🍹 Bar",
  front: "🛎️ Front",
};

export default function ItemRow({
  businessId,
  suppliers,
  item,
}: {
  businessId: string;
  suppliers: Supplier[];
  item: {
    id: string;
    itemName: string;
    itemType: "ingredient" | "product";
    ingredientId: string | null;
    productId: string | null;
    department: string | null;
    unit: string | null;
    qtyOrdered: number;
    currentStock: number | null;
    approvedQty: number | null;
    allocations: Allocation[];
  };
}) {
  const router = useRouter();
  const qtyInputId = useId();
  const [approvedQty, setApprovedQty] = useState(String(item.approvedQty ?? item.qtyOrdered));
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newQty, setNewQty] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(false);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const finalQty = item.approvedQty ?? item.qtyOrdered;
  const qtyWasAdjusted = item.approvedQty !== null && item.approvedQty !== item.qtyOrdered;
  const allocatedQty = item.allocations.reduce((s, a) => s + a.qty, 0);
  const remainingQty = Math.max(finalQty - allocatedQty, 0);
  const hasForwardedAllocation = item.allocations.some((a) => a.forwardedAt);

  function handleSaveQty() {
    const qty = Number(approvedQty);
    if (!approvedQty || Number.isNaN(qty) || qty < 0) {
      setError("Qty disetujui harus angka 0 atau lebih.");
      return;
    }
    setError(null);
    setPending(true);
    updateItemApprovedQty(businessId, item.id, qty)
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

  function handleAddAllocation() {
    const qty = Number(newQty);
    if (!newSupplierId) {
      setError("Pilih supplier dulu.");
      return;
    }
    if (!newQty || Number.isNaN(qty) || qty <= 0) {
      setError("Qty alokasi harus angka lebih dari 0.");
      return;
    }
    setError(null);
    setPending(true);
    addItemAllocation(businessId, item.id, newSupplierId, qty)
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        setShowAddForm(false);
        setNewSupplierId("");
        setNewQty("");
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  function handleDeleteAllocation(allocationId: string) {
    setError(null);
    setPending(true);
    deleteItemAllocation(businessId, allocationId)
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

  function handleMarkReceived(allocationId: string) {
    setError(null);
    setPending(true);
    markAllocationReceived(businessId, allocationId)
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

  function handleDeleteItem() {
    setError(null);
    setPending(true);
    deleteRequestItem(businessId, item.id)
      .then((res) => {
        setPending(false);
        setConfirmDeleteItem(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setConfirmDeleteItem(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  function purchaseHref(allocation: Allocation) {
    const params = new URLSearchParams({
      prefillCategory: item.itemType === "ingredient" ? "Bahan Baku" : "Barang Dagang",
      prefillItemId: (item.itemType === "ingredient" ? item.ingredientId : item.productId) ?? "",
      prefillQty: String(allocation.qty),
      fromAllocationId: allocation.id,
    });
    if (allocation.supplierId) params.set("prefillSupplierId", allocation.supplierId);
    if (item.unit) params.set("prefillQtyUnit", item.unit);
    return `/business/${businessId}/purchases?${params.toString()}`;
  }

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-800">
          {item.itemName}
          {item.department && DEPARTMENT_LABELS[item.department] && (
            <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
              {DEPARTMENT_LABELS[item.department]}
            </span>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2 text-right text-sm">
          {qtyWasAdjusted && (
            <span className="text-zinc-400 line-through">
              {item.qtyOrdered}
              {item.unit ? ` ${item.unit}` : ""}
            </span>
          )}
          <span className="font-medium text-zinc-900">
            {finalQty}
            {item.unit ? ` ${item.unit}` : ""}
          </span>
          {!hasForwardedAllocation &&
            (confirmDeleteItem ? (
              <span className="flex items-center gap-1 text-[10.5px]">
                <button
                  onClick={handleDeleteItem}
                  disabled={pending}
                  className="font-semibold text-red-600 hover:underline disabled:opacity-50"
                >
                  Ya
                </button>
                <button
                  onClick={() => setConfirmDeleteItem(false)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  Batal
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDeleteItem(true)}
                className="text-[10.5px] text-zinc-400 hover:text-red-600"
              >
                Hapus
              </button>
            ))}
        </div>
      </div>
      {item.currentStock !== null && (
        <p className="text-[10.5px] text-zinc-400">Stok saat ini: {item.currentStock}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={qtyInputId} className="text-[11px] text-zinc-500">
          Qty disetujui:
        </label>
        <input
          id={qtyInputId}
          type="number"
          min="0"
          step="any"
          value={approvedQty}
          onChange={(e) => setApprovedQty(e.target.value)}
          onBlur={handleSaveQty}
          disabled={pending}
          className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {item.allocations.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {item.allocations.map((a) => {
            const supplier = supplierMap.get(a.supplierId ?? "");
            return (
              <div key={a.id} className="rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-700">
                    → <span className="font-medium">{supplier?.name ?? "supplier"}</span>: {a.qty}
                    {item.unit ? ` ${item.unit}` : ""}
                  </p>
                  {!a.forwardedAt && (
                    <button
                      onClick={() => handleDeleteAllocation(a.id)}
                      disabled={pending}
                      className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
                    >
                      Hapus
                    </button>
                  )}
                </div>
                {a.forwardedAt && !a.receivedAt && (
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-brand-700">✓ Diteruskan</p>
                    <button
                      onClick={() => handleMarkReceived(a.id)}
                      disabled={pending}
                      className="rounded-md bg-zinc-800 px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-zinc-900 disabled:opacity-50"
                    >
                      Tandai Barang Datang
                    </button>
                  </div>
                )}
                {a.receivedAt && !a.purchaseId && (
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-brand-700">✓ Diteruskan · 📦 Barang datang</p>
                    <Link
                      href={purchaseHref(a)}
                      className="rounded-md bg-brand-600 px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-brand-700"
                    >
                      Catat sebagai Pembelian
                    </Link>
                  </div>
                )}
                {a.purchaseId && (
                  <p className="mt-1 text-brand-700">✓ Diteruskan · 📦 Datang · 💰 Sudah dicatat sebagai pembelian</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {remainingQty > 0 &&
        (showAddForm ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <select
              value={newSupplierId}
              onChange={(e) => setNewSupplierId(e.target.value)}
              disabled={pending}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">— Pilih supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="any"
              placeholder={`Qty (sisa ${remainingQty})`}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              disabled={pending}
              className="w-32 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <button
              onClick={handleAddAllocation}
              disabled={pending}
              className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Tambah
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-[11px] text-zinc-400 hover:text-zinc-600"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-2 text-[11px] font-medium text-brand-700 hover:underline"
          >
            + Alokasikan ke supplier{item.allocations.length > 0 ? " lain" : ""} (sisa {remainingQty}
            {item.unit ? ` ${item.unit}` : ""})
          </button>
        ))}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
