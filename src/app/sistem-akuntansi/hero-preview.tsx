"use client";

import { useEffect, useRef, useState } from "react";
import Logo from "@/components/logo";

const SLIDE_LABELS = ["Neraca", "Jurnal", "Payroll"];

function NeracaSlide() {
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-zinc-400">Total Aset</p>
          <p className="text-lg font-bold text-zinc-900">Rp47,1jt</p>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-zinc-400">Kewajiban</p>
          <p className="text-lg font-bold text-zinc-900">Rp5,8jt</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-zinc-50 p-3">
        <div>
          <p className="text-[10px] font-semibold uppercase text-zinc-400">Total Modal</p>
          <p className="text-lg font-bold text-zinc-900">Rp41,3jt</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
          ✓ Seimbang
        </span>
      </div>
    </>
  );
}

function JurnalSlide() {
  const rows = [
    { desc: "Penjualan INV-0248", debit: "Kas & Bank", credit: "Pendapatan", amt: "Rp76.450" },
    { desc: "Bayar Sewa Toko", debit: "Beban Sewa", credit: "Kas & Bank", amt: "Rp1.500.000" },
  ];
  return (
    <div className="mt-5 space-y-2">
      {rows.map((r) => (
        <div key={r.desc} className="rounded-xl bg-zinc-50 p-3">
          <div className="flex items-center justify-between">
            <p className="truncate text-xs font-semibold text-zinc-800">{r.desc}</p>
            <span className="shrink-0 text-xs font-bold text-zinc-900">{r.amt}</span>
          </div>
          <p className="mt-1 text-[10px] text-zinc-400">
            {r.debit} <span aria-hidden>→</span> {r.credit}
          </p>
        </div>
      ))}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
          ✓ Debit = Kredit
        </span>
      </div>
    </div>
  );
}

function PayrollSlide() {
  return (
    <>
      <div className="mt-5 space-y-1.5 rounded-xl bg-zinc-50 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Gaji Pokok</span>
          <span className="font-semibold text-zinc-800">Rp2.600.000</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Tunjangan</span>
          <span className="font-semibold text-zinc-800">Rp300.000</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Potongan</span>
          <span className="font-semibold text-red-500">-Rp50.000</span>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-1.5 text-xs font-bold text-zinc-900">
          <span>Total Diterima</span>
          <span>Rp2.850.000</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-zinc-50 p-3">
        <p className="text-xs font-semibold text-zinc-700">Juru Masak — Juli 2026</p>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
          ✓ Dibayar
        </span>
      </div>
    </>
  );
}

// Kartu preview di hero, sama pola carousel-nya dengan hero-preview.tsx di
// halaman utama (lihat src/app/hero-preview.tsx) — tapi slide-nya khusus
// modul akuntansi (bukan POS/Kasir, karena produk ini memang untuk toko
// yang sudah punya kasir sendiri).
export default function AccountingHeroPreview() {
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
          <Logo className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-zinc-900">Toko Kamu</p>
            <p className="text-xs text-zinc-400">{SLIDE_LABELS[active]}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
            Akuntansi
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
              <NeracaSlide />
            </div>
            <div className="w-full shrink-0">
              <JurnalSlide />
            </div>
            <div className="w-full shrink-0">
              <PayrollSlide />
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
