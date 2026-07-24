"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createManualTransaction, type ManualTransactionItemInput } from "./actions";

type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  stock: number;
  variant_label: string | null;
};

type Customer = { id: string; name: string; phone: string | null };

type CartLine = ManualTransactionItemInput & { name: string; price: number };

const BUILTIN_PAYMENT_METHODS = ["Tunai", "Kartu", "QRIS"];

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function todayDateString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export default function ManualTransactionForm({
  businessId,
  products,
  customers,
  customPaymentMethods,
}: {
  businessId: string;
  products: Product[];
  customers: Customer[];
  customPaymentMethods: string[];
}) {
  const router = useRouter();
  const paymentMethods = useMemo(
    () => [...BUILTIN_PAYMENT_METHODS, ...customPaymentMethods],
    [customPaymentMethods],
  );

  const [date, setDate] = useState(todayDateString());
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState(BUILTIN_PAYMENT_METHODS[0]);
  const [received, setReceived] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [search, products]);

  const total = useMemo(() => cart.reduce((sum, l) => sum + l.price * l.qty, 0), [cart]);
  const change = paymentMethod === "Tunai" && received ? Number(received) - total : null;

  function addProduct(product: Product) {
    setCart((c) => {
      const existing = c.find((l) => l.productId === product.id);
      if (existing) {
        return c.map((l) =>
          l.productId === product.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...c, { productId: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  }

  function updateQty(productId: string, qty: number) {
    setCart((c) =>
      qty <= 0
        ? c.filter((l) => l.productId !== productId)
        : c.map((l) => (l.productId === productId ? { ...l, qty } : l)),
    );
  }

  async function handleSubmit() {
    setError(null);

    if (cart.length === 0) {
      setError("Tambahkan minimal satu produk.");
      return;
    }
    if (!date) {
      setError("Tanggal wajib diisi.");
      return;
    }
    if (date > todayDateString()) {
      setError("Tanggal tidak boleh di masa depan.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createManualTransaction(
        businessId,
        new Date(`${date}T12:00:00`).toISOString(),
        cart.map((l) => ({ productId: l.productId, qty: l.qty })),
        paymentMethod,
        paymentMethod === "Tunai" && received ? Number(received) : null,
        customerId || null,
      );

      if (!result.success) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      router.push(`/business/${businessId}/transactions/${result.transactionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan transaksi.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white shadow-sm p-4">
        <label htmlFor="txn-date" className="mb-1 block text-xs font-medium text-zinc-600">
          Tanggal Transaksi
        </label>
        <input
          id="txn-date"
          type="date"
          value={date}
          max={todayDateString()}
          onChange={(e) => setDate(e.target.value)}
          className="w-full max-w-[200px] rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="rounded-xl bg-white shadow-sm p-4">
        <label htmlFor="txn-search" className="mb-1 block text-xs font-medium text-zinc-600">
          Cari Produk
        </label>
        <input
          id="txn-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ketik nama produk…"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addProduct(p)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-zinc-50"
            >
              <span className="truncate text-zinc-800">
                {p.name}
                {p.variant_label ? ` (${p.variant_label})` : ""}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">{formatRupiah(p.price)}</span>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <p className="px-2.5 py-1.5 text-xs text-zinc-400">Produk tidak ditemukan.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-sm p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Keranjang</h2>
        {cart.length === 0 ? (
          <p className="text-xs text-zinc-400">Belum ada produk dipilih.</p>
        ) : (
          <div className="space-y-2">
            {cart.map((l) => (
              <div key={l.productId} className="flex items-center justify-between gap-2 text-sm">
                <p className="min-w-0 flex-1 truncate text-zinc-800">{l.name}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateQty(l.productId, l.qty - 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  >
                    −
                  </button>
                  <span className="w-6 text-center">{l.qty}</span>
                  <button
                    type="button"
                    onClick={() => updateQty(l.productId, l.qty + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  >
                    +
                  </button>
                </div>
                <p className="w-20 shrink-0 text-right font-medium text-zinc-900">
                  {formatRupiah(l.price * l.qty)}
                </p>
              </div>
            ))}
            <div className="flex justify-between border-t border-zinc-100 pt-2 text-sm font-semibold text-zinc-900">
              <span>Total</span>
              <span>{formatRupiah(total)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white shadow-sm p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Pembayaran</h2>
        <div className="grid grid-cols-3 gap-2">
          {paymentMethods.map((m) => (
            <button
              key={m}
              type="button"
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
          <div className="mt-3">
            <label htmlFor="txn-received" className="mb-1 block text-xs font-medium text-zinc-600">
              Jumlah Diterima
            </label>
            <input
              id="txn-received"
              type="number"
              min="0"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {change !== null && (
              <p className={change < 0 ? "mt-1 text-xs text-red-600" : "mt-1 text-xs text-zinc-500"}>
                Kembalian: {formatRupiah(Math.max(change, 0))}
              </p>
            )}
          </div>
        )}
      </div>

      {customers.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm p-4">
          <label htmlFor="txn-customer" className="mb-1 block text-xs font-medium text-zinc-600">
            Pelanggan (opsional)
          </label>
          <select
            id="txn-customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Tidak ada —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || cart.length === 0}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Menyimpan…" : "Simpan Transaksi"}
      </button>
    </div>
  );
}
