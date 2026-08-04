"use client";

import { useMemo, useState } from "react";
import { submitSelfOrder } from "./actions";

type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  emoji: string | null;
  image_url: string | null;
  featured: boolean;
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

function ProductCard({
  p,
  inCart,
  onChangeQty,
  onSetNote,
}: {
  p: Product;
  inCart: CartItem | undefined;
  onChangeQty: (delta: number) => void;
  onSetNote: (note: string) => void;
}) {
  return (
    <div
      className={`relative rounded-xl border bg-white overflow-hidden transition-all ${
        inCart ? "border-brand-400 shadow-sm shadow-brand-100" : "border-zinc-200"
      } ${!p.in_stock ? "opacity-60" : ""}`}
    >
      {/* Foto / placeholder */}
      <div className="relative w-full aspect-square bg-zinc-100 flex items-center justify-center overflow-hidden">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl">{p.emoji || "🍽️"}</span>
        )}
        {/* Badge habis */}
        {!p.in_stock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-700">
              Habis
            </span>
          </div>
        )}
        {/* Badge qty */}
        {inCart && (
          <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white shadow">
            {inCart.qty}
          </span>
        )}
      </div>

      {/* Info + kontrol */}
      <div className="p-2.5">
        <p className="text-xs font-semibold text-zinc-900 line-clamp-2 leading-tight">{p.name}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{formatRupiah(p.price)}</p>

        {p.in_stock && (
          <div className="mt-2 flex items-center justify-between gap-1">
            {inCart ? (
              <>
                <button
                  onClick={() => onChangeQty(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-base font-bold text-zinc-600 hover:bg-zinc-200 active:scale-95"
                >
                  −
                </button>
                <span className="text-sm font-semibold tabular-nums text-zinc-800">
                  {inCart.qty}
                </span>
                <button
                  onClick={() => onChangeQty(1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-base font-bold text-white hover:bg-brand-700 active:scale-95"
                >
                  +
                </button>
              </>
            ) : (
              <button
                onClick={() => onChangeQty(1)}
                className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 active:scale-95"
              >
                + Tambah
              </button>
            )}
          </div>
        )}

        {inCart && (
          <input
            type="text"
            value={inCart.note}
            onChange={(e) => onSetNote(e.target.value)}
            maxLength={200}
            placeholder="Catatan…"
            className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none"
          />
        )}
      </div>
    </div>
  );
}

export default function OrderScreen({
  qrSlug,
  businessName,
  tableName,
  banner,
  products,
}: {
  qrSlug: string;
  businessName: string;
  tableName: string;
  banner: string | null;
  products: Product[];
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const featured = useMemo(() => products.filter((p) => p.featured), [products]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (!p.featured) set.add(p.category || "Lainnya");
    }
    return Array.from(set);
  }, [products]);

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.qty, 0);

  function changeQty(product: Product, delta: number) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (!existing) {
        if (delta <= 0) return prev;
        return [...prev, { productId: product.id, name: product.name, price: product.price, qty: 1, note: "" }];
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
      cart.map((i) => ({ productId: i.productId, qty: i.qty, note: i.note.trim() || null })),
    );
    setSubmitting(false);
    if (!result.success) { setError(result.error); return; }
    setSent(true);
    setCart([]);
  }

  if (sent) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white shadow-sm p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">✅</div>
          <h1 className="text-lg font-bold text-zinc-900">Pesanan terkirim!</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pesanan kamu sudah masuk ke kasir. Kasir akan segera memprosesnya.
          </p>
          <div className="mt-4 rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3 text-left">
            <p className="text-xs font-semibold text-zinc-700">Mau pesan lebih?</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Kamu bisa terus menambah pesanan. Semua akan digabung dan dibayar sekaligus di kasir.
            </p>
          </div>
          <button
            onClick={() => setSent(false)}
            className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            + Tambah Pesanan
          </button>
          <button
            onClick={() => setSent(false)}
            className="mt-2 w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Lihat Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-100 px-4 py-3">
        <p className="text-[11px] font-medium text-zinc-400">{businessName}</p>
        <h1 className="text-base font-bold text-zinc-900">🪑 {tableName}</h1>
      </div>

      <div className="px-4 py-4 space-y-6 max-w-lg mx-auto w-full">
        {/* Banner */}
        {banner && (
          <div className="rounded-xl bg-brand-50 border border-brand-200 px-4 py-3">
            <p className="text-sm text-brand-800 whitespace-pre-line">{banner}</p>
          </div>
        )}

        {products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400">
            Menu belum tersedia.
          </p>
        ) : (
          <>
            {/* Menu Pilihan */}
            {featured.length > 0 && (
              <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-500">
                  ★ Menu Pilihan
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {featured.map((p) => (
                    <ProductCard
                      key={p.id}
                      p={p}
                      inCart={cart.find((i) => i.productId === p.id)}
                      onChangeQty={(d) => changeQty(p, d)}
                      onSetNote={(n) => setNote(p.id, n)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Kategori */}
            {categories.map((cat) => (
              <div key={cat}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {cat}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {products
                    .filter((p) => !p.featured && (p.category || "Lainnya") === cat)
                    .map((p) => (
                      <ProductCard
                        key={p.id}
                        p={p}
                        inCart={cart.find((i) => i.productId === p.id)}
                        onChangeQty={(d) => changeQty(p, d)}
                        onSetNote={(n) => setNote(p.id, n)}
                      />
                    ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Sticky order bar */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white px-4 py-3">
          <div className="mx-auto w-full max-w-lg">
            {error && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex w-full items-center justify-between rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
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
