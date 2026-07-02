"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { checkout, closeShift, type CloseShiftSummary } from "./actions";
import SwitchCashierButton from "./switch-cashier-button";

type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  cost: number;
  stock: number;
  emoji: string | null;
};

type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  maxStock: number;
};

const PAYMENT_METHODS = ["Tunai", "Kartu", "QRIS"];

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
}: {
  businessId: string;
  businessName: string;
  cashierId: string;
  cashierName: string;
  shiftId: string;
  products: Product[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [received, setReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInvoice, setSuccessInvoice] = useState<string | null>(null);

  const [closingShift, setClosingShift] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closedSummary, setClosedSummary] = useState<CloseShiftSummary | null>(null);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [search, products]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const receivedAmount = Number(received) || 0;
  const change = paymentMethod === "Tunai" ? receivedAmount - subtotal : 0;

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
        { productId: product.id, name: product.name, price: product.price, qty: 1, maxStock: product.stock },
      ];
    });
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

  async function handleConfirmPayment() {
    setError(null);

    if (paymentMethod === "Tunai" && receivedAmount < subtotal) {
      setError("Uang diterima kurang dari total belanja.");
      return;
    }

    setSubmitting(true);
    const result = await checkout(
      businessId,
      cashierId,
      cart.map((i) => ({ productId: i.productId, qty: i.qty })),
      paymentMethod,
      paymentMethod === "Tunai" ? receivedAmount : subtotal,
    );
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSuccessInvoice(result.invoiceNumber);
    setCart([]);
    setPaying(false);
    setReceived("");
  }

  async function handleConfirmCloseShift() {
    setCloseError(null);

    const amount = Number(closingCash);
    if (!closingCash || Number.isNaN(amount) || amount < 0) {
      setCloseError("Jumlah kas harus angka dan tidak boleh negatif.");
      return;
    }

    setCloseSubmitting(true);
    const result = await closeShift(shiftId, amount, closeNotes);
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
          <button
            onClick={() => {
              setSuccessInvoice(null);
              router.refresh();
            }}
            className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
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
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk…"
            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
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
              {filteredProducts.map((p) => {
                const inCart = cart.find((i) => i.productId === p.id)?.qty ?? 0;
                const soldOut = p.stock <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={soldOut || inCart >= p.stock}
                    className="relative rounded-xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {inCart > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                        {inCart}
                      </span>
                    )}
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-lg">
                      {p.emoji || "📦"}
                    </div>
                    <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
                    <p className="text-xs text-zinc-500">
                      {soldOut ? "Stok habis" : `Stok ${p.stock}`}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900">
                      {formatRupiah(p.price)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="flex w-full flex-col border-t border-zinc-200 bg-white lg:w-80 lg:border-l lg:border-t-0">
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Keranjang</h2>
          {cart.length === 0 ? (
            <p className="text-xs text-zinc-400">Belum ada item. Klik produk untuk menambah.</p>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => (
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
                    <p className="text-xs font-semibold text-zinc-900">
                      {formatRupiah(item.price * item.qty)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 p-4">
          <div className="mb-3 flex items-center justify-between text-sm font-semibold text-zinc-900">
            <span>Total</span>
            <span>{formatRupiah(subtotal)}</span>
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
                {PAYMENT_METHODS.map((m) => (
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
                    placeholder={String(subtotal)}
                  />
                  {receivedAmount >= subtotal && received !== "" && (
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
    </div>
  );
}
