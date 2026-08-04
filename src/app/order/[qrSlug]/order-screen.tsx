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

type Step = "identity" | "menu" | "review" | "sent";
type PaymentMethod = "kasir" | "qr";

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
      <div className="relative w-full aspect-square bg-zinc-100 flex items-center justify-center overflow-hidden">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl">{p.emoji || "🍽️"}</span>
        )}
        {!p.in_stock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-700">
              Habis
            </span>
          </div>
        )}
        {inCart && (
          <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white shadow">
            {inCart.qty}
          </span>
        )}
      </div>

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
  const [step, setStep] = useState<Step>("identity");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("kasir");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  function handleIdentitySubmit() {
    let ok = true;
    if (!customerName.trim()) {
      setNameError("Nama wajib diisi");
      ok = false;
    } else {
      setNameError("");
    }
    const phone = customerPhone.replace(/\D/g, "");
    if (phone.length < 8) {
      setPhoneError("Nomor HP tidak valid");
      ok = false;
    } else {
      setPhoneError("");
    }
    if (ok) setStep("menu");
  }

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
    setSubmitError(null);
    setSubmitting(true);
    const result = await submitSelfOrder(
      qrSlug,
      cart.map((i) => ({ productId: i.productId, qty: i.qty, note: i.note.trim() || null })),
      customerName.trim(),
      customerPhone.trim(),
      paymentMethod,
    );
    setSubmitting(false);
    if (!result.success) {
      setSubmitError(result.error);
      return;
    }
    setCart([]);
    setStep("sent");
  }

  // ── Step: identity ──────────────────────────────────────────────
  if (step === "identity") {
    return (
      <div className="flex flex-1 flex-col bg-zinc-50">
        <div className="bg-white border-b border-zinc-100 px-4 py-3">
          <p className="text-[11px] font-medium text-zinc-400">{businessName}</p>
          <h1 className="text-base font-bold text-zinc-900">🪑 {tableName}</h1>
        </div>

        <div className="flex flex-1 flex-col justify-center px-4 py-8">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl">
                👋
              </div>
              <h2 className="text-lg font-bold text-zinc-900">Selamat datang!</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Isi data kamu sebelum melihat menu
              </p>
            </div>

            {banner && (
              <div className="mb-4 rounded-xl bg-brand-50 border border-brand-200 px-4 py-3">
                <p className="text-sm text-brand-800 whitespace-pre-line">{banner}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Nama <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleIdentitySubmit()}
                  placeholder="Nama kamu"
                  maxLength={100}
                  autoFocus
                  className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                    nameError ? "border-red-400 bg-red-50" : "border-zinc-200 bg-white"
                  }`}
                />
                {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  No. HP / WhatsApp <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleIdentitySubmit()}
                  placeholder="08xxxxxxxxxx"
                  maxLength={20}
                  className={`w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                    phoneError ? "border-red-400 bg-red-50" : "border-zinc-200 bg-white"
                  }`}
                />
                {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
              </div>

              <button
                onClick={handleIdentitySubmit}
                className="mt-2 w-full rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.98]"
              >
                Lihat Menu →
              </button>

              <p className="text-center text-[11px] text-zinc-400">
                Data kamu hanya digunakan untuk keperluan pesanan
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: sent ──────────────────────────────────────────────────
  if (step === "sent") {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white shadow-sm p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-2xl">✅</div>
          <h1 className="text-lg font-bold text-zinc-900">Pesanan terkirim!</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Halo <span className="font-semibold text-zinc-700">{customerName}</span>,
            pesanan kamu sudah masuk ke kasir.
          </p>

          {paymentMethod === "kasir" && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left">
              <p className="text-xs font-semibold text-amber-800">💳 Pembayaran di Kasir</p>
              <p className="mt-0.5 text-xs text-amber-700">
                Selesaikan pembayaran di kasir setelah pesanan selesai diproses.
              </p>
            </div>
          )}

          <div className="mt-4 rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3 text-left">
            <p className="text-xs font-semibold text-zinc-700">Mau pesan lebih?</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Kamu bisa terus menambah pesanan. Semua akan digabung dan dibayar sekaligus di kasir.
            </p>
          </div>

          <button
            onClick={() => setStep("menu")}
            className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            + Tambah Pesanan
          </button>
          <button
            onClick={() => setStep("menu")}
            className="mt-2 w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Lihat Menu
          </button>
        </div>
      </div>
    );
  }

  // ── Step: review ────────────────────────────────────────────────
  if (step === "review") {
    return (
      <div className="flex flex-1 flex-col bg-zinc-50">
        <div className="sticky top-0 z-10 bg-white border-b border-zinc-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setStep("menu")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-sm text-zinc-600 hover:bg-zinc-200"
          >
            ←
          </button>
          <div>
            <p className="text-[11px] font-medium text-zinc-400">{businessName} · {tableName}</p>
            <h1 className="text-sm font-bold text-zinc-900">Review Pesanan</h1>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 space-y-4 max-w-lg mx-auto w-full">
          {/* Ringkasan item */}
          <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Pesanan kamu</p>
            </div>
            <div className="divide-y divide-zinc-100">
              {cart.map((item) => (
                <div key={item.productId} className="flex items-start justify-between gap-2 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{item.name}</p>
                    {item.note && (
                      <p className="text-xs text-zinc-400 mt-0.5">Catatan: {item.note}</p>
                    )}
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {item.qty} × {formatRupiah(item.price)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-zinc-800 tabular-nums">
                    {formatRupiah(item.price * item.qty)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="text-sm font-semibold text-zinc-700">Total</p>
              <p className="text-base font-bold text-brand-700 tabular-nums">{formatRupiah(total)}</p>
            </div>
          </div>

          {/* Data pelanggan */}
          <div className="rounded-xl bg-white border border-zinc-200 px-4 py-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Data kamu</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Nama</span>
                <span className="font-medium text-zinc-900">{customerName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">No. HP</span>
                <span className="font-medium text-zinc-900">{customerPhone}</span>
              </div>
            </div>
          </div>

          {/* Metode pembayaran */}
          <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Metode Pembayaran</p>
            </div>
            <div className="divide-y divide-zinc-100">
              <label className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-zinc-50 transition-colors">
                <input
                  type="radio"
                  name="payment"
                  value="kasir"
                  checked={paymentMethod === "kasir"}
                  onChange={() => setPaymentMethod("kasir")}
                  className="h-4 w-4 accent-brand-600"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-900">💵 Bayar di Kasir</p>
                  <p className="text-xs text-zinc-500">Bayar langsung ke kasir setelah pesanan selesai</p>
                </div>
              </label>
              <div className="flex items-center gap-3 px-4 py-3.5 opacity-50">
                <input
                  type="radio"
                  name="payment"
                  value="qr"
                  disabled
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-900">📱 QR Pay</p>
                  <p className="text-xs text-zinc-400">Segera hadir</p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                  Segera
                </span>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-2.5">
            <span className="text-base shrink-0">⚠️</span>
            <p className="text-xs text-amber-800 leading-relaxed">
              Pesanan yang telah dikirim ke kasir <span className="font-semibold">tidak dapat dibatalkan</span>.
              Pastikan pesanan kamu sudah benar sebelum menekan tombol kirim.
            </p>
          </div>

          {submitError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-xs text-red-600">{submitError}</p>
            </div>
          )}
        </div>

        {/* Sticky bottom */}
        <div className="sticky bottom-0 border-t border-zinc-200 bg-white px-4 py-3">
          <div className="mx-auto w-full max-w-lg">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex w-full items-center justify-between rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60 active:scale-[0.98]"
            >
              <span>{submitting ? "Mengirim…" : "Kirim Pesanan ke Kasir"}</span>
              <span className="tabular-nums">{formatRupiah(total)}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: menu ──────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 pb-28">
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-100 px-4 py-3">
        <p className="text-[11px] font-medium text-zinc-400">{businessName}</p>
        <h1 className="text-base font-bold text-zinc-900">
          🪑 {tableName}
          <span className="ml-2 text-[11px] font-normal text-zinc-400">· Halo, {customerName}!</span>
        </h1>
      </div>

      <div className="px-4 py-4 space-y-6 max-w-lg mx-auto w-full">
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

      {/* Sticky cart bar */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white px-4 py-3">
          <div className="mx-auto w-full max-w-lg">
            <button
              onClick={() => setStep("review")}
              className="flex w-full items-center justify-between rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.98]"
            >
              <span>🛒 Review Pesanan ({itemCount} item)</span>
              <span className="tabular-nums">{formatRupiah(total)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
