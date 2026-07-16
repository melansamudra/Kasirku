"use client";

import { useEffect, useRef, useState } from "react";

const CHART_BARS = [40, 65, 50, 80, 60, 95, 70];
const CART_ITEMS = [
  { name: "Kopi Susu", qty: 2, price: "Rp36.000" },
  { name: "Roti Bakar", qty: 1, price: "Rp18.500" },
];

const SLIDE_LABELS = ["Dashboard", "Kasir", "Laporan"];

function DashboardSlide() {
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-zinc-400">Penjualan</p>
          <p className="text-lg font-bold text-zinc-900">Rp2.450.000</p>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-zinc-400">Transaksi</p>
          <p className="text-lg font-bold text-zinc-900">48</p>
        </div>
      </div>
      <div className="mt-3 flex h-20 items-end gap-1.5 rounded-xl bg-zinc-50 p-3">
        {CHART_BARS.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-gradient-to-t from-brand-600 to-brand-400"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </>
  );
}

function KasirSlide() {
  return (
    <>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {["Kopi Susu", "Roti Bakar", "Es Teh", "Nasi Goreng", "Ayam Bakar", "Jus Jeruk"].map((name) => (
          <div key={name} className="rounded-lg bg-zinc-50 p-2 text-center">
            <p className="truncate text-[10px] font-semibold text-zinc-600">{name}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5 rounded-xl bg-zinc-50 p-3">
        {CART_ITEMS.map((item) => (
          <div key={item.name} className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">
              {item.name} x{item.qty}
            </span>
            <span className="font-semibold text-zinc-800">{item.price}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-zinc-200 pt-1.5 text-xs font-bold text-zinc-900">
          <span>Total</span>
          <span>Rp90.500</span>
        </div>
      </div>
    </>
  );
}

function LaporanSlide() {
  return (
    <>
      <div className="mt-5 space-y-2.5 rounded-xl bg-zinc-50 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Pendapatan</span>
          <span className="font-semibold text-zinc-900">Rp8.240.000</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Beban</span>
          <span className="font-semibold text-zinc-900">Rp3.120.000</span>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-xs font-bold">
          <span className="text-zinc-900">Laba Bersih</span>
          <span className="text-brand-700">Rp5.120.000</span>
        </div>
      </div>
      <div className="mt-3 flex h-20 items-center gap-2 rounded-xl bg-zinc-50 p-3">
        <div className="h-14 w-14 shrink-0 rounded-full border-[6px] border-brand-500" style={{ borderRightColor: "#fde68a", borderTopColor: "#fde68a" }} />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase text-zinc-400">Margin</p>
          <p className="text-lg font-bold text-zinc-900">62%</p>
        </div>
      </div>
    </>
  );
}

// Kartu preview di hero — dulu cuma nampilin Dashboard statis, sekarang jadi
// carousel 3 layar (Dashboard/Kasir/Laporan) yang bisa di-geser di HP dan
// otomatis gonta-ganti, supaya pengunjung langsung lihat lebih dari satu
// bagian aplikasi tanpa harus daftar dulu.
export default function HeroPreview() {
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const timer = setInterval(() => {
      setActive((a) => (a + 1) % SLIDE_LABELS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) {
      setActive((a) => {
        const dir = delta < 0 ? 1 : -1;
        return (a + dir + SLIDE_LABELS.length) % SLIDE_LABELS.length;
      });
    }
    touchStartX.current = null;
  }

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div aria-hidden className="absolute -top-5 -right-5 h-20 w-20 rounded-2xl bg-amber-200/60" />
      <div aria-hidden className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-brand-200/60" />

      <div className="relative rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl shadow-zinc-300/40">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
            K
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-zinc-900">Toko Kamu</p>
            <p className="text-xs text-zinc-400">{SLIDE_LABELS[active]}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
            ● Shift aktif
          </span>
        </div>

        <div
          className="mt-1 touch-pan-y overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${active * 100}%)` }}
          >
            <div className="w-full shrink-0">
              <DashboardSlide />
            </div>
            <div className="w-full shrink-0">
              <KasirSlide />
            </div>
            <div className="w-full shrink-0">
              <LaporanSlide />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          {SLIDE_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-label={`Lihat tampilan ${label}`}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-5 bg-brand-600" : "w-1.5 bg-zinc-200"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
