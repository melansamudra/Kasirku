"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics/google-analytics";
import { DesktopAppPreview } from "./desktop-app-preview";

type Ingredient = { id: string; name: string; cost: string };

function formatRupiah(value: number) {
  if (!Number.isFinite(value)) return "Rp0";
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function makeIngredient(name = "", cost = ""): Ingredient {
  return { id: crypto.randomUUID(), name, cost };
}

export function HppCalculator() {
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => [
    makeIngredient("Nasi 1 porsi", "2500"),
    makeIngredient("Telur 1 butir", "2000"),
    makeIngredient("Ayam suwir 50gr", "4000"),
    makeIngredient("Bumbu & minyak", "1500"),
  ]);
  const [portions, setPortions] = useState("1");
  const [marginPercent, setMarginPercent] = useState("60");
  const trackedRef = useRef(false);

  const totalCost = ingredients.reduce((sum, ing) => sum + (parseFloat(ing.cost) || 0), 0);
  const portionCount = Math.max(parseFloat(portions) || 1, 1);
  const hppPerPortion = totalCost / portionCount;
  const margin = Math.min(Math.max(parseFloat(marginPercent) || 0, 0), 95);
  const suggestedPrice = hppPerPortion / (1 - margin / 100);
  const grossProfit = suggestedPrice - hppPerPortion;

  function trackFirstUse() {
    if (!trackedRef.current) {
      trackedRef.current = true;
      trackEvent("hpp_calculator_used");
    }
  }

  function updateIngredient(id: string, field: "name" | "cost", value: string) {
    trackFirstUse();
    setIngredients((prev) => prev.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing)));
  }

  function addIngredient() {
    trackFirstUse();
    setIngredients((prev) => [...prev, makeIngredient()]);
  }

  function removeIngredient(id: string) {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-3">
        <p className="text-sm font-bold text-zinc-900">Bahan & Biaya per Porsi</p>
        <div className="mt-4 space-y-2">
          {ingredients.map((ing) => (
            <div key={ing.id} className="flex items-center gap-2">
              <input
                type="text"
                value={ing.name}
                onChange={(e) => updateIngredient(ing.id, "name", e.target.value)}
                placeholder="Nama bahan"
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <input
                type="number"
                inputMode="numeric"
                value={ing.cost}
                onChange={(e) => updateIngredient(ing.id, "cost", e.target.value)}
                placeholder="Biaya (Rp)"
                className="w-28 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none sm:w-32"
              />
              <button
                type="button"
                onClick={() => removeIngredient(ing.id)}
                className="shrink-0 rounded-lg px-2 py-2 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-red-500"
                aria-label="Hapus bahan"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addIngredient}
          className="mt-3 text-xs font-semibold text-brand-700 hover:underline"
        >
          + Tambah Bahan
        </button>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-6">
          <div>
            <label className="text-xs font-semibold text-zinc-500">Jumlah Porsi Dihasilkan</label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={portions}
              onChange={(e) => {
                trackFirstUse();
                setPortions(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">Target Margin Kotor (%)</label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="95"
              value={marginPercent}
              onChange={(e) => {
                trackFirstUse();
                setMarginPercent(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 lg:col-span-2">
        <div className="rounded-2xl bg-zinc-900 p-6 text-white shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">HPP per Porsi</p>
          <p className="mt-1 text-3xl font-bold">{formatRupiah(hppPerPortion)}</p>
          <p className="mt-1 text-xs text-zinc-400">Total biaya bahan: {formatRupiah(totalCost)}</p>
        </div>

        <div className="rounded-2xl border-2 border-brand-500 bg-brand-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            Harga Jual Disarankan
          </p>
          <p className="mt-1 text-3xl font-bold text-brand-700">{formatRupiah(suggestedPrice)}</p>
          <p className="mt-1 text-xs text-brand-600">
            Margin kotor: {formatRupiah(grossProfit)} ({margin}%)
          </p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-emerald-600 p-6 text-white shadow-lg">
          <p className="text-sm font-bold">Capek Hitung Ulang Tiap Harga Bahan Naik?</p>
          <p className="mt-1.5 text-xs leading-relaxed text-brand-50/90">
            KasirKu menghitung HPP setiap produk otomatis dari resepnya — begitu harga satu bahan
            berubah, semua produk yang memakainya ikut ter-update sendiri.
          </p>
          <Link
            href="/signup"
            onClick={() => trackEvent("hpp_calculator_cta_click")}
            className="mt-4 inline-block rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 shadow-md transition-colors hover:bg-brand-50"
          >
            Coba KasirKu Gratis →
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-zinc-900">Cuma Butuh Kalkulator HPP-nya Saja?</p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
            Ada versi aplikasi desktop — sekali beli, data tersimpan di komputermu sendiri, tanpa
            perlu daftar toko/kasir.
          </p>
          <div className="mt-3">
            <DesktopAppPreview />
          </div>
          <Link
            href="/kalkulator-hpp/beli"
            onClick={() => trackEvent("hpp_calculator_desktop_cta_click")}
            className="mt-4 inline-block rounded-xl border border-brand-200 px-5 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            💻 Lihat Aplikasi Desktop
          </Link>
        </div>
      </div>
    </div>
  );
}
