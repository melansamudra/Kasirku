"use client";

import { useMemo, useState } from "react";
import { submitSelfOrder } from "./actions";

type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  emoji: string | null;
  in_stock: boolean;
};

type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  note: string;
};

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default function OrderScreen({
  qrSlug,
  businessName,
  tableName,
  products,
}: {
  qrSlug: string;
  businessName: string;
  tableName: string;
  products: Product[];
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.category || "Lainnya");
    return Array.from(set);
  }, [products]);

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.qty, 0);

  function changeQty(product: Product, delta: number) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (!existing) {
        if (delta <= 0) return prev;
        return [
          ...prev,
          { productId: product.id, name: product.name, price: product.price, qty: 1, note: "" },
        ];
      }
      const qty = Math.min(99, Math.max(0, existing.qty + delta));
      if (qty === 0) return prev.filter((i) => i.productId !== product.id);
      return prev.map((i) => (i.productId === product.id ? { ...i, qty } : i));
    });
  }

  function setNote(productId: string, note: string) {
    setCart((prev) => prev.map((i) => (i.productId === productId ? { ...i, note } : i)));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const result = await submitSelfOrder(
      qrSlug,
      cart.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        note: i.note.trim() || null,
      })),
    );
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSent(true);
    setCart([]);
  }

  if (sent) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white shadow-sm p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
            ✅
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Pesanan terkirim!</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pesanan untuk {tableName} sudah diterima. Silakan lakukan pembayaran di kasir.
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Pesan Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-8 pb-28">
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium text-zinc-400">{businessName}</p>
        <h1 className="text-lg font-bold text-zinc-900">🪑 {tableName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pilih menu, lalu kirim pesanan. Pembayaran dilakukan di kasir.
        </p>

        {products.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Menu belum tersedia.
          </p>
        ) : (
          categories.map((cat) => (
            <div key={cat} className="mt-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {cat}
              </h2>
              <div className="space-y-2">
                {products
                  .filter((p) => (p.category || "Lainnya") === cat)
                  .map((p) => {
                    const inCart = cart.find((i) => i.productId === p.id);
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border bg-white p-3 ${
                          inCart ? "border-brand-300" : "border-zinc-200"
                        } ${p.in_stock ? "" : "opacity-50"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xl">
                            {p.emoji || "🍽️"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
                            <p className="text-xs text-zinc-500">
                              {p.in_stock ? formatRupiah(p.price) : "Habis"}
                            </p>
                          </div>
                          {p.in_stock && (
                            <div className="flex shrink-0 items-center gap-2">
                              {inCart && (
                                <>
                                  <button
                                    onClick={() => changeQty(p, -1)}
                                    className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100 text-sm font-bold text-zinc-600 hover:bg-zinc-200"
                                  >
                                    −
                                  </button>
                                  <span className="w-4 text-center text-sm tabular-nums">
                                    {inCart.qty}
                                  </span>
                                </>
                              )}
                              <button
                                onClick={() => changeQty(p, 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white hover:bg-brand-700"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                        {inCart && (
                          <input
                            type="text"
                            value={inCart.note}
                            onChange={(e) => setNote(p.id, e.target.value)}
                            maxLength={200}
                            placeholder="Catatan (mis. tanpa es, pedas)…"
                            className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sticky submit bar */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white px-4 py-3">
          <div className="mx-auto w-full max-w-sm">
            {error && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex w-full items-center justify-between rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{submitting ? "Mengirim…" : `Kirim Pesanan (${itemCount} item)`}</span>
              <span>{formatRupiah(total)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
