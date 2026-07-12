"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  checkout,
  closeShift,
  deleteOpenBill,
  saveOpenBill,
  updateSelfOrderStatus,
  type CloseShiftSummary,
  type DiscountType,
} from "./actions";
import SwitchCashierButton from "./switch-cashier-button";
import { itemDiscAmount, calculateCheckoutTotals } from "@/lib/checkout-totals";

type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  cost: number;
  stock: number;
  emoji: string | null;
  barcode: string | null;
  sku: string | null;
  variant_label: string | null;
};

type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  maxStock: number;
  disc: number;
  discType: DiscountType;
};

type SelfOrder = {
  id: string;
  status: "baru" | "diproses";
  createdAt: string;
  tableName: string;
  items: {
    productId: string | null;
    name: string;
    qty: number;
    price: number;
    note: string | null;
  }[];
};

type OpenBill = {
  id: string;
  label: string;
  updated_at: string;
  items: {
    product_id: string;
    name: string;
    price: number;
    qty: number;
    disc: number;
    disc_type: DiscountType;
  }[];
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

const BUILTIN_PAYMENT_METHODS = ["Tunai", "Kartu", "QRIS"];

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default function PosScreen({
  businessId,
  businessName,
  cashierId,
  cashierName,
  shiftId,
  products,
  taxRate,
  serviceRate,
  openBills,
  customers,
  isFnb,
  selfOrders,
  customPaymentMethods,
}: {
  businessId: string;
  businessName: string;
  cashierId: string;
  cashierName: string;
  shiftId: string;
  products: Product[];
  taxRate: number;
  serviceRate: number;
  openBills: OpenBill[];
  customers: Customer[];
  isFnb: boolean;
  selfOrders: SelfOrder[];
  customPaymentMethods: string[];
}) {
  const router = useRouter();
  const paymentMethods = useMemo(
    () => [...BUILTIN_PAYMENT_METHODS, ...customPaymentMethods],
    [customPaymentMethods],
  );
  const [search, setSearch] = useState("");
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOrderIds, setCartOrderIds] = useState<string[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxNotice, setInboxNotice] = useState<string | null>(null);
  const [orderBusyId, setOrderBusyId] = useState<string | null>(null);
  const [editingDiscId, setEditingDiscId] = useState<string | null>(null);
  const [orderDisc, setOrderDisc] = useState(0);
  const [orderDiscType, setOrderDiscType] = useState<DiscountType>("pct");
  const [orderDiscOpen, setOrderDiscOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [billsOpen, setBillsOpen] = useState(false);
  const [billBusyId, setBillBusyId] = useState<string | null>(null);
  const [activeBill, setActiveBill] = useState<{ id: string; label: string } | null>(null);
  const [saveBonOpen, setSaveBonOpen] = useState(false);
  const [bonLabel, setBonLabel] = useState("");
  const [bonError, setBonError] = useState<string | null>(null);
  const [bonSaving, setBonSaving] = useState(false);

  const newOrderCount = selfOrders.filter((o) => o.status === "baru").length;

  // Order self-order masuk dari perangkat pelanggan; poll supaya badge kasir
  // ikut terbarui tanpa reload manual. router.refresh() mempertahankan state
  // client (keranjang tidak hilang).
  useEffect(() => {
    if (!isFnb) return;
    const interval = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(interval);
  }, [isFnb, router]);
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(BUILTIN_PAYMENT_METHODS[0]);
  const [received, setReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInvoice, setSuccessInvoice] = useState<string | null>(null);
  const [successTransactionId, setSuccessTransactionId] = useState<string | null>(null);

  const [closingShift, setClosingShift] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closedSummary, setClosedSummary] = useState<CloseShiftSummary | null>(null);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase() === q ||
        p.sku?.toLowerCase() === q,
    );
  }, [search, products]);

  // Variants are just extra product rows sharing the same name — group them
  // here purely for display, no schema relationship involved.
  const productGroups = useMemo(() => {
    const groups: { name: string; variants: Product[] }[] = [];
    for (const p of filteredProducts) {
      const existing = groups.find((g) => g.name === p.name);
      if (existing) {
        existing.variants.push(p);
      } else {
        groups.push({ name: p.name, variants: [p] });
      }
    }
    return groups;
  }, [filteredProducts]);

  const [variantPickerGroup, setVariantPickerGroup] = useState<{
    name: string;
    variants: Product[];
  } | null>(null);

  function handleProductClick(group: { name: string; variants: Product[] }) {
    if (group.variants.length === 1) {
      addToCart(group.variants[0]);
    } else {
      setVariantPickerGroup(group);
    }
  }

  // Barcode scanners act like a keyboard: they type the code then send
  // Enter. On Enter, an exact barcode/SKU match jumps straight into the cart
  // instead of just filtering the grid.
  useEffect(() => {
    if (!scanFeedback) return;
    const timer = setTimeout(() => setScanFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [scanFeedback]);

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = search.trim();
    if (!q) return;
    const match = products.find((p) => p.barcode === q || p.sku === q);
    if (match) {
      addToCart(match);
      setSearch("");
      setScanFeedback(null);
    } else if (products.some((p) => p.barcode || p.sku)) {
      setScanFeedback(`"${q}" tidak ditemukan.`);
    }
  }

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q),
    );
  }, [customerSearch, customers]);

  const { subtotalRaw, totalItemDisc, afterItemDisc, orderDiscAmt, serviceAmt, taxAmt, total } =
    calculateCheckoutTotals({
      items: cart,
      orderDisc,
      orderDiscType,
      serviceRate,
      taxRate,
    });
  const receivedAmount = Number(received) || 0;
  const change = paymentMethod === "Tunai" ? receivedAmount - total : 0;

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        if (existing.qty >= product.stock) return prev;
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + 1 } : i,
        );
      }
      if (product.stock <= 0) return prev;
      return [
        ...prev,
        {
          productId: product.id,
          name: product.variant_label ? `${product.name} (${product.variant_label})` : product.name,
          price: product.price,
          qty: 1,
          maxStock: product.stock,
          disc: 0,
          discType: "pct" as DiscountType,
        },
      ];
    });
  }

  function setItemDisc(productId: string, disc: number, discType: DiscountType) {
    setCart((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, disc, discType } : i)),
    );
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === productId
            ? { ...i, qty: Math.min(i.maxStock, Math.max(0, i.qty + delta)) }
            : i,
        )
        .filter((i) => i.qty > 0),
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function handleSaveBon() {
    setBonError(null);
    setBonSaving(true);
    const result = await saveOpenBill(
      businessId,
      activeBill?.id ?? null,
      bonLabel,
      cart.map((i) => ({
        product_id: i.productId,
        name: i.name,
        price: i.price,
        qty: i.qty,
        disc: i.disc,
        disc_type: i.discType,
      })),
    );
    setBonSaving(false);

    if (!result.success) {
      setBonError(result.error);
      return;
    }

    setCart([]);
    setCartOrderIds([]);
    setOrderDisc(0);
    setOrderDiscType("pct");
    setActiveBill(null);
    setSaveBonOpen(false);
    setBonLabel("");
    router.refresh();
  }

  function handleLoadBill(bill: OpenBill) {
    if (
      cart.length > 0 &&
      !window.confirm(`Keranjang aktif akan digabung dengan "${bill.label}". Lanjutkan?`)
    ) {
      return;
    }

    const next = cart.map((c) => ({ ...c }));
    const skipped: string[] = [];

    for (const item of bill.items) {
      const product = products.find((p) => p.id === item.product_id);
      if (!product) {
        skipped.push(item.name);
        continue;
      }
      const existing = next.find((c) => c.productId === product.id);
      const currentQty = existing ? existing.qty : 0;
      const addQty = Math.min(item.qty, product.stock - currentQty);
      if (addQty <= 0) {
        skipped.push(item.name);
        continue;
      }
      if (existing) {
        existing.qty += addQty;
      } else {
        next.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: addQty,
          maxStock: product.stock,
          disc: item.disc,
          discType: item.disc_type,
        });
      }
    }

    setCart(next);
    setActiveBill({ id: bill.id, label: bill.label });
    setInboxNotice(
      skipped.length > 0
        ? `Tidak masuk keranjang (stok habis / produk terhapus): ${skipped.join(", ")}`
        : null,
    );
    setBillsOpen(false);
  }

  async function handleDeleteBill(bill: OpenBill) {
    if (!window.confirm(`Hapus open bill "${bill.label}"?`)) return;
    setBillBusyId(bill.id);
    await deleteOpenBill(businessId, bill.id);
    setBillBusyId(null);
    if (activeBill?.id === bill.id) setActiveBill(null);
    router.refresh();
  }

  async function handleOrderStatus(orderId: string, status: "diproses" | "selesai") {
    setOrderBusyId(orderId);
    await updateSelfOrderStatus(businessId, orderId, status);
    setOrderBusyId(null);
    router.refresh();
  }

  async function handleAddOrderToCart(order: SelfOrder) {
    const next = cart.map((c) => ({ ...c }));
    const skipped: string[] = [];

    for (const item of order.items) {
      const product = item.productId
        ? products.find((p) => p.id === item.productId)
        : undefined;
      if (!product) {
        skipped.push(item.name);
        continue;
      }
      const existing = next.find((c) => c.productId === product.id);
      const currentQty = existing ? existing.qty : 0;
      const addQty = Math.min(item.qty, product.stock - currentQty);
      if (addQty <= 0) {
        skipped.push(item.name);
        continue;
      }
      if (existing) {
        existing.qty += addQty;
      } else {
        next.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          qty: addQty,
          maxStock: product.stock,
          disc: 0,
          discType: "pct",
        });
      }
    }

    setCart(next);
    setCartOrderIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]));
    setInboxNotice(
      skipped.length > 0
        ? `Tidak masuk keranjang (stok habis / produk terhapus): ${skipped.join(", ")}`
        : null,
    );
    setInboxOpen(false);
    await handleOrderStatus(order.id, "diproses");
  }

  async function handleConfirmPayment() {
    setError(null);

    if (paymentMethod === "Tunai" && receivedAmount < total) {
      setError("Uang diterima kurang dari total belanja.");
      return;
    }

    setSubmitting(true);
    const result = await checkout(
      businessId,
      cashierId,
      cart.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        disc: i.disc,
        discType: i.discType,
      })),
      paymentMethod,
      paymentMethod === "Tunai" ? receivedAmount : total,
      orderDisc,
      orderDiscType,
      selectedCustomer?.id ?? null,
      cartOrderIds,
    );
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    // Bon yang dimuat sudah dibayar — bereskan dari daftar.
    if (activeBill) {
      await deleteOpenBill(businessId, activeBill.id);
      setActiveBill(null);
    }

    setSuccessInvoice(result.invoiceNumber);
    setSuccessTransactionId(result.transactionId);
    setCart([]);
    setCartOrderIds([]);
    setPaying(false);
    setReceived("");
    setOrderDisc(0);
    setOrderDiscType("pct");
    setOrderDiscOpen(false);
    setEditingDiscId(null);
    setSelectedCustomer(null);
    setCustomerPickerOpen(false);
    setCustomerSearch("");
  }

  async function handleConfirmCloseShift() {
    setCloseError(null);

    const amount = Number(closingCash);
    if (!closingCash || Number.isNaN(amount) || amount < 0) {
      setCloseError("Jumlah kas harus angka dan tidak boleh negatif.");
      return;
    }

    setCloseSubmitting(true);
    const result = await closeShift(businessId, shiftId, amount, closeNotes);
    setCloseSubmitting(false);

    if (!result.success) {
      setCloseError(result.error);
      return;
    }

    setClosedSummary(result.summary);
  }

  if (successInvoice) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
            ✅
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Transaksi berhasil</h1>
          <p className="mt-1 text-sm text-zinc-500">No. Struk: {successInvoice}</p>
          {successTransactionId && (
            <Link
              href={`/business/${businessId}/transactions/${successTransactionId}/receipt`}
              target="_blank"
              className="mt-6 block w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              🖨️ Cetak Struk
            </Link>
          )}
          <button
            onClick={() => {
              setSuccessInvoice(null);
              setSuccessTransactionId(null);
              router.refresh();
            }}
            className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Transaksi Baru
          </button>
        </div>
      </div>
    );
  }

  if (closedSummary) {
    const diff = closedSummary.difference;
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
          <h1 className="text-center text-lg font-bold text-zinc-900">Shift Ditutup</h1>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>Total Penjualan</span>
              <span className="font-medium text-zinc-900">
                {formatRupiah(closedSummary.total_sales)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Penjualan Tunai</span>
              <span className="font-medium text-zinc-900">
                {formatRupiah(closedSummary.cash_sales)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Penjualan Non-Tunai</span>
              <span className="font-medium text-zinc-900">
                {formatRupiah(closedSummary.non_cash_sales)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Jumlah Transaksi</span>
              <span className="font-medium text-zinc-900">{closedSummary.tx_count}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-100 pt-2 text-zinc-600">
              <span>Kas Diharapkan</span>
              <span className="font-medium text-zinc-900">
                {formatRupiah(closedSummary.expected_cash)}
              </span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className={diff === 0 ? "text-zinc-900" : diff > 0 ? "text-brand-700" : "text-red-600"}>
                Selisih
              </span>
              <span className={diff === 0 ? "text-zinc-900" : diff > 0 ? "text-brand-700" : "text-red-600"}>
                {diff === 0 ? "Pas" : `${diff > 0 ? "+" : ""}${formatRupiah(diff)}`}
              </span>
            </div>
          </div>
          <button
            onClick={() => router.refresh()}
            className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Selesai
          </button>
        </div>
      </div>
    );
  }

  if (closingShift) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
          <h1 className="text-lg font-bold text-zinc-900">Tutup Shift</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Hitung uang tunai di laci, lalu masukkan jumlahnya.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="closingCash" className="mb-1 block text-xs font-medium text-zinc-600">
                Kas di Laci Sekarang (Rp)
              </label>
              <input
                id="closingCash"
                type="number"
                min="0"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="mis. 750000"
              />
            </div>
            <div>
              <label htmlFor="closeNotes" className="mb-1 block text-xs font-medium text-zinc-600">
                Catatan (opsional)
              </label>
              <input
                id="closeNotes"
                type="text"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {closeError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{closeError}</p>
            )}

            <button
              onClick={handleConfirmCloseShift}
              disabled={closeSubmitting}
              className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {closeSubmitting ? "Memproses…" : "Tutup Shift"}
            </button>
            <button
              onClick={() => {
                setClosingShift(false);
                setCloseError(null);
              }}
              className="w-full py-1 text-center text-xs font-medium text-zinc-400 hover:text-zinc-600"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-zinc-50 lg:flex-row">
      {/* Catalog */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Cari produk atau scan barcode…"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {scanFeedback && (
              <p className="absolute left-0 top-full mt-1 text-xs text-red-600">{scanFeedback}</p>
            )}
          </div>
          <button
            onClick={() => setBillsOpen(true)}
            className="relative flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            🧾 <span className="hidden sm:inline">Bon</span>
            {openBills.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                {openBills.length}
              </span>
            )}
          </button>
          {isFnb && (
            <button
              onClick={() => setInboxOpen(true)}
              className="relative flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              🛎️ <span className="hidden sm:inline">Order</span>
              {newOrderCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {newOrderCount}
                </span>
              )}
            </button>
          )}
          <div className="text-right">
            <p className="text-xs font-semibold text-zinc-700">{cashierName}</p>
            <p className="text-[10px] text-zinc-400">{businessName}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <p className="mt-10 text-center text-sm text-zinc-400">
              {products.length === 0
                ? "Belum ada produk. Tambahkan dulu di halaman Kelola Produk."
                : "Produk tidak ditemukan."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {productGroups.map((g) => {
                const isVariantGroup = g.variants.length > 1;
                const single = g.variants[0];
                const inCart = g.variants.reduce(
                  (sum, v) => sum + (cart.find((i) => i.productId === v.id)?.qty ?? 0),
                  0,
                );
                const totalStock = g.variants.reduce((sum, v) => sum + v.stock, 0);
                const soldOut = isVariantGroup ? totalStock <= 0 : single.stock <= 0;
                return (
                  <button
                    key={g.name}
                    onClick={() => handleProductClick(g)}
                    disabled={soldOut || (!isVariantGroup && inCart >= single.stock)}
                    className="relative rounded-xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {inCart > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                        {inCart}
                      </span>
                    )}
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-lg">
                      {single.emoji || "📦"}
                    </div>
                    <p className="truncate text-sm font-medium text-zinc-900">{g.name}</p>
                    <p className="text-xs text-zinc-500">
                      {isVariantGroup
                        ? `${g.variants.length} varian`
                        : soldOut
                          ? "Stok habis"
                          : `Stok ${single.stock}`}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900">
                      {isVariantGroup
                        ? `${formatRupiah(Math.min(...g.variants.map((v) => v.price)))}${
                            new Set(g.variants.map((v) => v.price)).size > 1 ? "+" : ""
                          }`
                        : formatRupiah(single.price)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {variantPickerGroup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900">Pilih Varian — {variantPickerGroup.name}</h3>
              <button
                onClick={() => setVariantPickerGroup(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {variantPickerGroup.variants.map((v) => {
                const inCart = cart.find((i) => i.productId === v.id)?.qty ?? 0;
                const soldOut = v.stock <= 0;
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      addToCart(v);
                      setVariantPickerGroup(null);
                    }}
                    disabled={soldOut || inCart >= v.stock}
                    className="flex w-full items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 text-left transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>
                      <span className="block text-sm font-medium text-zinc-900">
                        {v.variant_label || "Varian"}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {soldOut ? "Stok habis" : `Stok ${v.stock}`}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-zinc-900">
                      {formatRupiah(v.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cart */}
      <div className="flex w-full flex-col border-t border-zinc-200 bg-white lg:w-80 lg:border-l lg:border-t-0">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Keranjang</h2>
            {activeBill && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                🧾 {activeBill.label}
              </span>
            )}
          </div>
          {inboxNotice && (
            <div className="mb-3 flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <span>{inboxNotice}</span>
              <button
                onClick={() => setInboxNotice(null)}
                className="shrink-0 font-bold hover:text-amber-900"
              >
                ✕
              </button>
            </div>
          )}
          {cart.length === 0 ? (
            <p className="text-xs text-zinc-400">Belum ada item. Klik produk untuk menambah.</p>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => {
                const discAmt = itemDiscAmount(item);
                const editing = editingDiscId === item.productId;
                return (
                  <div key={item.productId} className="rounded-xl border border-zinc-100 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-zinc-900">{item.name}</p>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-xs text-zinc-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => changeQty(item.productId, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-xs font-bold text-zinc-600 hover:bg-zinc-200"
                        >
                          −
                        </button>
                        <span className="w-4 text-center text-xs tabular-nums">{item.qty}</span>
                        <button
                          onClick={() => changeQty(item.productId, 1)}
                          disabled={item.qty >= item.maxStock}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-xs font-bold text-zinc-600 hover:bg-zinc-200 disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                      {discAmt > 0 ? (
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-400 line-through tabular-nums">
                            {formatRupiah(item.price * item.qty)}
                          </p>
                          <p className="text-xs font-semibold text-brand-700 tabular-nums">
                            {formatRupiah(item.price * item.qty - discAmt)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs font-semibold text-zinc-900 tabular-nums">
                          {formatRupiah(item.price * item.qty)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingDiscId(editing ? null : item.productId)}
                      className={`mt-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        item.disc > 0
                          ? "border-brand-200 bg-brand-50 text-brand-700"
                          : "border-zinc-200 text-zinc-400 hover:border-brand-300 hover:text-brand-700"
                      }`}
                    >
                      {item.disc > 0
                        ? `Diskon ${item.discType === "pct" ? `${item.disc}%` : formatRupiah(item.disc)}`
                        : "% Diskon"}
                    </button>
                    {editing && (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-100 pt-2">
                        <div className="flex overflow-hidden rounded-lg border border-zinc-200">
                          <button
                            onClick={() => setItemDisc(item.productId, item.disc, "pct")}
                            className={`px-2 py-1 text-[10px] font-bold ${
                              item.discType === "pct"
                                ? "bg-brand-600 text-white"
                                : "text-zinc-500"
                            }`}
                          >
                            %
                          </button>
                          <button
                            onClick={() => setItemDisc(item.productId, item.disc, "amt")}
                            className={`px-2 py-1 text-[10px] font-bold ${
                              item.discType === "amt"
                                ? "bg-brand-600 text-white"
                                : "text-zinc-500"
                            }`}
                          >
                            Rp
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max={item.discType === "pct" ? 100 : item.price}
                          value={item.disc || ""}
                          onChange={(e) => {
                            const raw = Number(e.target.value) || 0;
                            const clamped =
                              item.discType === "pct"
                                ? Math.min(100, Math.max(0, raw))
                                : Math.min(item.price, Math.max(0, raw));
                            setItemDisc(item.productId, clamped, item.discType);
                          }}
                          placeholder="0"
                          className="w-full flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none"
                        />
                        <button
                          onClick={() => setEditingDiscId(null)}
                          className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-200"
                        >
                          OK
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 p-4">
          <div className="mb-3">
            <button
              onClick={() => setCustomerPickerOpen((v) => !v)}
              className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selectedCustomer
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-zinc-200 text-zinc-400 hover:border-brand-300 hover:text-brand-700"
              }`}
            >
              <span>👤 {selectedCustomer ? selectedCustomer.name : "Tanpa Pelanggan"}</span>
              {selectedCustomer && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCustomer(null);
                  }}
                  className="text-zinc-400 hover:text-red-500"
                >
                  ✕
                </span>
              )}
            </button>
            {customerPickerOpen && (
              <div className="mt-1.5 rounded-lg border border-zinc-200 bg-white p-2">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Cari nama / no. telepon…"
                  className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
                />
                <div className="mt-1.5 max-h-40 overflow-y-auto">
                  <button
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerPickerOpen(false);
                      setCustomerSearch("");
                    }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-zinc-500 hover:bg-zinc-50"
                  >
                    Tanpa pelanggan
                  </button>
                  {filteredCustomers.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-zinc-400">Tidak ditemukan.</p>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerPickerOpen(false);
                          setCustomerSearch("");
                        }}
                        className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                      >
                        {c.name}
                        {c.phone && <span className="text-zinc-400"> · {c.phone}</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="mb-3 space-y-1">
            {(totalItemDisc > 0 || orderDiscAmt > 0 || serviceAmt > 0 || taxAmt > 0) && (
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatRupiah(subtotalRaw)}</span>
              </div>
            )}
            {totalItemDisc > 0 && (
              <div className="flex items-center justify-between text-xs text-brand-700">
                <span>Diskon item</span>
                <span className="tabular-nums">− {formatRupiah(totalItemDisc)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <button
                onClick={() => setOrderDiscOpen((v) => !v)}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  orderDisc > 0
                    ? "border-brand-200 bg-brand-50 text-brand-700"
                    : "border-zinc-200 text-zinc-400 hover:border-brand-300 hover:text-brand-700"
                }`}
              >
                {orderDisc > 0
                  ? `Diskon order ${orderDiscType === "pct" ? `${orderDisc}%` : formatRupiah(orderDisc)}`
                  : "% Diskon Order"}
              </button>
              {orderDiscAmt > 0 && (
                <span className="tabular-nums text-brand-700">
                  − {formatRupiah(orderDiscAmt)}
                </span>
              )}
            </div>
            {orderDiscOpen && (
              <div className="flex items-center gap-1.5 py-1">
                <div className="flex overflow-hidden rounded-lg border border-zinc-200">
                  <button
                    onClick={() => setOrderDiscType("pct")}
                    className={`px-2 py-1 text-[10px] font-bold ${
                      orderDiscType === "pct" ? "bg-brand-600 text-white" : "text-zinc-500"
                    }`}
                  >
                    %
                  </button>
                  <button
                    onClick={() => setOrderDiscType("amt")}
                    className={`px-2 py-1 text-[10px] font-bold ${
                      orderDiscType === "amt" ? "bg-brand-600 text-white" : "text-zinc-500"
                    }`}
                  >
                    Rp
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  max={orderDiscType === "pct" ? 100 : afterItemDisc}
                  value={orderDisc || ""}
                  onChange={(e) => {
                    const raw = Number(e.target.value) || 0;
                    setOrderDisc(
                      orderDiscType === "pct"
                        ? Math.min(100, Math.max(0, raw))
                        : Math.max(0, raw),
                    );
                  }}
                  placeholder="0"
                  className="w-full flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none"
                />
                <button
                  onClick={() => setOrderDiscOpen(false)}
                  className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-200"
                >
                  OK
                </button>
              </div>
            )}
            {serviceAmt > 0 && (
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Layanan ({serviceRate}%)</span>
                <span className="tabular-nums">{formatRupiah(serviceAmt)}</span>
              </div>
            )}
            {taxAmt > 0 && (
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>PPN ({taxRate}%)</span>
                <span className="tabular-nums">{formatRupiah(taxAmt)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 text-sm font-semibold text-zinc-900">
              <span>Total</span>
              <span className="tabular-nums">{formatRupiah(total)}</span>
            </div>
          </div>

          {!paying ? (
            <>
              <button
                onClick={() => setPaying(true)}
                disabled={cart.length === 0}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Bayar
              </button>
              {!saveBonOpen ? (
                <button
                  onClick={() => {
                    setBonLabel(activeBill?.label ?? `Bon ${openBills.length + 1}`);
                    setBonError(null);
                    setSaveBonOpen(true);
                  }}
                  disabled={cart.length === 0}
                  className="mt-2 w-full rounded-xl border border-brand-200 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  🧾 Simpan Bon
                </button>
              ) : (
                <div className="mt-2 space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                  <label
                    htmlFor="bonLabel"
                    className="block text-xs font-medium text-zinc-600"
                  >
                    Nama bon (mis. nama meja / pelanggan)
                  </label>
                  <input
                    id="bonLabel"
                    type="text"
                    value={bonLabel}
                    onChange={(e) => setBonLabel(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  {bonError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                      {bonError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSaveBonOpen(false)}
                      className="flex-1 rounded-xl border border-zinc-200 bg-white py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleSaveBon}
                      disabled={bonSaving}
                      className="flex-1 rounded-xl bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                    >
                      {bonSaving ? "Menyimpan…" : "Simpan"}
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => setClosingShift(true)}
                className="mt-2 w-full rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
              >
                Tutup Shift
              </button>
              <SwitchCashierButton />
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {paymentMethods.map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`rounded-xl border py-2 text-xs font-medium transition-colors ${
                      paymentMethod === m
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {paymentMethod === "Tunai" && (
                <div>
                  <label htmlFor="received" className="mb-1 block text-xs font-medium text-zinc-600">
                    Uang Diterima
                  </label>
                  <input
                    id="received"
                    type="number"
                    min="0"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    placeholder={String(total)}
                  />
                  {receivedAmount >= total && received !== "" && (
                    <p className="mt-1 text-xs text-zinc-500">
                      Kembalian: {formatRupiah(change)}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <button
                onClick={handleConfirmPayment}
                disabled={submitting}
                className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Memproses…" : "Konfirmasi Pembayaran"}
              </button>
              <button
                onClick={() => {
                  setPaying(false);
                  setError(null);
                }}
                className="w-full py-1 text-center text-xs font-medium text-zinc-400 hover:text-zinc-600"
              >
                Batal
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Open bills */}
      {billsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setBillsOpen(false)}
          />
          <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-bold text-zinc-900">🧾 Open Bill</h2>
              <button
                onClick={() => setBillsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {openBills.length === 0 ? (
                <p className="py-12 text-center text-xs text-zinc-400">
                  Belum ada bon tersimpan. Isi keranjang lalu klik Simpan Bon.
                </p>
              ) : (
                openBills.map((bill) => {
                  const billAfterDisc = bill.items.reduce((sum, i) => {
                    const gross = i.price * i.qty;
                    const disc =
                      i.disc_type === "pct"
                        ? Math.round((gross * i.disc) / 100)
                        : Math.min(i.disc * i.qty, gross);
                    return sum + gross - disc;
                  }, 0);
                  const billService = Math.round((billAfterDisc * serviceRate) / 100);
                  const billTax = Math.round(
                    ((billAfterDisc + billService) * taxRate) / 100,
                  );
                  const billTotal = billAfterDisc + billService + billTax;
                  const itemCount = bill.items.reduce((s, i) => s + i.qty, 0);
                  const preview =
                    bill.items
                      .slice(0, 2)
                      .map((i) => i.name)
                      .join(", ") +
                    (bill.items.length > 2 ? ` +${bill.items.length - 2}` : "");
                  const busy = billBusyId === bill.id;
                  const isLoaded = activeBill?.id === bill.id;
                  return (
                    <div
                      key={bill.id}
                      className={`rounded-xl border-2 p-3.5 ${
                        isLoaded ? "border-brand-300 bg-brand-50" : "border-brand-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold text-zinc-800">
                            🧾 {bill.label}
                            {isLoaded && (
                              <span className="ml-1.5 text-[10px] font-semibold text-brand-700">
                                · sedang dimuat
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-zinc-400">
                            {new Date(bill.updated_at).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            · {itemCount} item
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-brand-700 tabular-nums">
                          {formatRupiah(billTotal)}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">{preview}</p>
                      <div className="mt-2 flex justify-end gap-1.5 border-t border-zinc-100 pt-2">
                        <button
                          onClick={() => handleDeleteBill(bill)}
                          disabled={busy}
                          className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-red-500 ring-1 ring-red-200 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          Hapus
                        </button>
                        <button
                          onClick={() => handleLoadBill(bill)}
                          disabled={busy || isLoaded}
                          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                        >
                          {isLoaded ? "Dimuat" : "Muat ke Keranjang"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Self-order inbox */}
      {inboxOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setInboxOpen(false)}
          />
          <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-bold text-zinc-900">🛎️ Order Masuk</h2>
              <button
                onClick={() => setInboxOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 hover:bg-zinc-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {selfOrders.length === 0 ? (
                <p className="py-12 text-center text-xs text-zinc-400">
                  Belum ada order dari meja.
                </p>
              ) : (
                selfOrders.map((o) => {
                  const total = o.items.reduce((sum, i) => sum + i.price * i.qty, 0);
                  const busy = orderBusyId === o.id;
                  const isNew = o.status === "baru";
                  return (
                    <div
                      key={o.id}
                      className={`rounded-xl border-2 p-3.5 ${
                        isNew ? "border-amber-300 bg-amber-50" : "border-sky-200 bg-sky-50"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold text-zinc-800">🪑 {o.tableName}</p>
                          <p className="text-[11px] text-zinc-400">
                            Masuk{" "}
                            {new Date(o.createdAt).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isNew ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {isNew ? "Baru" : "Diproses"}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1">
                        {o.items.map((item, idx) => (
                          <div key={idx} className="text-xs text-zinc-700">
                            <div className="flex justify-between">
                              <span>
                                <span className="font-bold">{item.qty}×</span> {item.name}
                              </span>
                              <span className="tabular-nums text-zinc-500">
                                {formatRupiah(item.price * item.qty)}
                              </span>
                            </div>
                            {item.note && (
                              <p className="pl-4 text-[11px] font-medium text-amber-600">
                                📝 {item.note}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-zinc-200/60 pt-2">
                        <p className="text-xs font-bold text-zinc-800 tabular-nums">
                          Total {formatRupiah(total)}
                        </p>
                        <div className="flex gap-1.5">
                          {isNew ? (
                            <>
                              <button
                                onClick={() => handleOrderStatus(o.id, "diproses")}
                                disabled={busy}
                                className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-zinc-600 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                              >
                                Proses
                              </button>
                              <button
                                onClick={() => handleAddOrderToCart(o)}
                                disabled={busy}
                                className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                              >
                                + Ke Kasir
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleOrderStatus(o.id, "selesai")}
                              disabled={busy}
                              className="rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
                            >
                              ✓ Selesai
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
