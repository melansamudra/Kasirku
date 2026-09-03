"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addItemAllocation,
  approveItemBudget,
  deleteItemAllocation,
  deleteRequestItem,
  markAllocationReceived,
  markItemFulfillment,
  updateItemApprovedQty,
} from "./actions";

type Supplier = { id: string; name: string };
type Employee = { id: string; name: string };
type Allocation = {
  id: string;
  supplierId: string | null;
  qty: number;
  forwardedAt: string | null;
  receivedAt: string | null;
  purchaseId: string | null;
  poId: string | null;
  poStatus: string | null;
  grnOkQty: number | null;
};

const PO_STATUS_LABEL: Record<string, string> = {
  issued: "Menunggu Approval",
  approved: "Approved",
  rejected: "Ditolak",
};
type StockFulfillment = { qty: number; markedAt: string; receivedAt: string | null };

const DEPARTMENT_LABELS: Record<string, string> = {
  dapur: "🍳 Dapur",
  bar: "🍹 Bar",
  front: "🛎️ Front",
};

const BUDGET_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Cek Budget",
  approved_in_budget: "APPROVED IN BUDGET",
  rejected: "Ditolak (Budget)",
};
const BUDGET_STATUS_STYLE: Record<string, string> = {
  pending: "border-amber-500 bg-amber-50 text-amber-700",
  approved_in_budget: "border-brand-600 bg-brand-50 text-brand-700",
  rejected: "border-red-500 bg-red-50 text-red-700",
};

export default function ItemRow({
  businessId,
  suppliers,
  employees,
  costControlEnabled,
  procurementBudgetGateEnabled,
  currentActorName,
  canApproveBudget,
  item,
}: {
  businessId: string;
  suppliers: Supplier[];
  employees: Employee[];
  costControlEnabled: boolean;
  procurementBudgetGateEnabled: boolean;
  currentActorName: string | null;
  canApproveBudget: boolean;
  item: {
    id: string;
    itemName: string;
    itemType: "ingredient" | "product";
    ingredientId: string | null;
    productId: string | null;
    departments: string[];
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
  const [budgetRejectNote, setBudgetRejectNote] = useState("");
  const [showBudgetRejectForm, setShowBudgetRejectForm] = useState(false);
  const [fulfillmentMarkedBy, setFulfillmentMarkedBy] = useState("");

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const finalQty = item.approvedQty ?? item.qtyOrdered;
  const qtyWasAdjusted = item.approvedQty !== null && item.approvedQty !== item.qtyOrdered;
  const allocatedQty = item.allocations.reduce((s, a) => s + a.qty, 0);
  const remainingQty = Math.max(finalQty - allocatedQty, 0);
  const hasForwardedAllocation = item.allocations.some((a) => a.forwardedAt);
  const isIngredient = item.ingredientId !== null;
  // Fulfillment stok-vs-supplier cuma konsep bisnis cost-control (stok per
  // lokasi/Gudang Utama tidak ada di bisnis lain). Permintaan Barang dipakai
  // BARENG bisnis lain juga -- tanpa gerbang costControlEnabled ini, form
  // alokasi supplier yang dari dulu langsung tampil buat mereka jadi
  // ketutup di belakang tombol baru yang tidak relevan buat mereka sama
  // sekali (fulfillment_source defaultnya 'pending' untuk SEMUA bisnis,
  // bukan cuma cost-control -- kolomnya ada di skema semua PR).
  const showSupplierFlow = !costControlEnabled || !isIngredient || item.fulfillmentSource === "supplier";

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

  function handleApproveBudget(decision: "approved_in_budget" | "rejected") {
    setError(null);
    setPending(true);
    approveItemBudget(businessId, item.id, decision, budgetRejectNote)
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        setShowBudgetRejectForm(false);
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  function handleMarkFulfillment(source: "stock" | "supplier") {
    setError(null);
    setPending(true);
    markItemFulfillment(businessId, item.id, source, fulfillmentMarkedBy || undefined)
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

  function purchaseHref(allocation: Allocation, qtyOverride?: number) {
    const params = new URLSearchParams({
      prefillCategory: item.itemType === "ingredient" ? "Bahan Baku" : "Barang Dagang",
      prefillItemId: (item.itemType === "ingredient" ? item.ingredientId : item.productId) ?? "",
      prefillQty: String(qtyOverride ?? allocation.qty),
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
          {item.departments.map(
            (dep) =>
              DEPARTMENT_LABELS[dep] && (
                <span
                  key={dep}
                  className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500"
                >
                  {DEPARTMENT_LABELS[dep]}
                </span>
              ),
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
        <p className="text-[10.5px] text-zinc-400">Stok saat order dibuat: {item.currentStock}</p>
      )}
      {costControlEnabled && item.totalStock !== null && (
        <p className="text-[10.5px] text-zinc-400">
          Stok saat ini (semua lokasi): <span className="font-medium text-zinc-500">{item.totalStock}</span>
          {item.unit ? ` ${item.unit}` : ""}
        </p>
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

      {costControlEnabled && procurementBudgetGateEnabled && (
        <div className="mt-2">
          {item.budgetStatus === "pending" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
              <p className="text-[10.5px] font-semibold text-amber-800">Verifikasi & Otorisasi Anggaran</p>
              {!canApproveBudget ? (
                <p className="mt-1 text-[10.5px] text-amber-700">
                  Akun Anda tidak punya izin Setujui PO/Budget. Minta Owner aktifkan permission &quot;Setujui
                  PO&quot; di Kelola Admin.
                </p>
              ) : (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10.5px] text-zinc-600">
                    Masuk sebagai <span className="font-semibold text-zinc-800">{currentActorName}</span>
                  </span>
                  <button
                    onClick={() => handleApproveBudget("approved_in_budget")}
                    disabled={pending}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    ✓ APPROVED IN BUDGET
                  </button>
                  {showBudgetRejectForm ? (
                    <span className="flex items-center gap-1">
                      <input
                        type="text"
                        value={budgetRejectNote}
                        onChange={(e) => setBudgetRejectNote(e.target.value)}
                        placeholder="Alasan penolakan…"
                        className="rounded-lg border border-zinc-200 px-2 py-1 text-[10.5px] focus:border-brand-600 focus:outline-none"
                      />
                      <button
                        onClick={() => handleApproveBudget("rejected")}
                        disabled={pending}
                        className="rounded-lg border border-red-300 px-2.5 py-1 text-[10.5px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Kirim
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setShowBudgetRejectForm(true)}
                      className="text-[10.5px] text-zinc-500 hover:text-red-600"
                    >
                      Tolak
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {item.budgetStatus === "approved_in_budget" && (
            <span
              className={`inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${BUDGET_STATUS_STYLE.approved_in_budget}`}
              title={item.budgetApprovedBy ? `Oleh ${item.budgetApprovedBy}` : undefined}
            >
              {BUDGET_STATUS_LABEL.approved_in_budget}
            </span>
          )}
          {item.budgetStatus === "rejected" && (
            <p className="rounded-lg bg-red-50 px-2 py-1.5 text-[10.5px] text-red-700">
              Ditolak oleh {item.budgetApprovedBy}
              {item.budgetNote ? `: ${item.budgetNote}` : ""}
            </p>
          )}
        </div>
      )}

      {costControlEnabled && isIngredient && item.fulfillmentSource === "pending" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <select
            value={fulfillmentMarkedBy}
            onChange={(e) => setFulfillmentMarkedBy(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2 py-1 text-[10.5px] focus:border-brand-600 focus:outline-none"
          >
            <option value="">— Ditandai oleh (opsional) —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.name}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => handleMarkFulfillment("stock")}
            disabled={pending}
            className="rounded-lg bg-zinc-800 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-zinc-900 disabled:opacity-50"
          >
            📦 Ambil dari Gudang
          </button>
          <button
            onClick={() => handleMarkFulfillment("supplier")}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            🛒 Order ke Supplier
          </button>
        </div>
      )}

      {costControlEnabled && isIngredient && item.fulfillmentSource === "stock" && (
        <div className="mt-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[11px]">
          <p className="font-medium text-zinc-700">📦 Ambil dari Gudang Utama</p>
          {item.stockFulfillment?.receivedAt ? (
            <p className="text-brand-700">✓ Diterima di lokasi peminta</p>
          ) : (
            <p className="text-amber-700">Menunggu lokasi peminta konfirmasi terima stok</p>
          )}
        </div>
      )}

      {showSupplierFlow && (
        <>
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
                    {/* GRN Fase 2: allocation yang punya PO pakai status PO+GRN buat
                        nentuin kapan siap dicatat pembelian, bukan flip manual
                        "Tandai Barang Datang" lagi (itu cuma buat allocation
                        TANPA PO -- bisnis non-cost-control/data lama). */}
                    {a.forwardedAt && a.poId && !a.purchaseId && (
                      <div className="mt-1 flex items-center justify-between">
                        {a.poStatus === "approved" ? (
                          a.grnOkQty && a.grnOkQty > 0 ? (
                            <p className="text-brand-700">
                              ✓ {a.grnOkQty}/{a.qty}
                              {item.unit ? ` ${item.unit}` : ""} diterima (GRN)
                            </p>
                          ) : (
                            <p className="text-amber-700">✓ Diteruskan · PO Approved — menunggu GRN</p>
                          )
                        ) : (
                          <p className={a.poStatus === "rejected" ? "text-red-600" : "text-amber-700"}>
                            {a.poStatus === "rejected" ? "✗ PO Ditolak" : "⏳"}{" "}
                            {PO_STATUS_LABEL[a.poStatus ?? ""] ?? a.poStatus}
                          </p>
                        )}
                        {a.poStatus === "approved" && a.grnOkQty && a.grnOkQty > 0 ? (
                          <Link
                            href={purchaseHref(a, a.grnOkQty)}
                            className="rounded-md bg-brand-600 px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-brand-700"
                          >
                            Catat sebagai Pembelian
                          </Link>
                        ) : (
                          <Link
                            href={`/business/${businessId}/purchase-orders/${a.poId}`}
                            className="rounded-md border border-zinc-200 px-2 py-1 text-[10.5px] font-medium text-zinc-600 hover:bg-zinc-50"
                          >
                            {a.poStatus === "approved" ? "Catat GRN di halaman PO" : "Lihat PO"}
                          </Link>
                        )}
                      </div>
                    )}
                    {a.forwardedAt && !a.poId && !a.receivedAt && (
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
                    {a.forwardedAt && !a.poId && a.receivedAt && !a.purchaseId && (
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
        </>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
