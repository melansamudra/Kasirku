"use client";

import { useMemo, useState } from "react";

type Ingredient = { name: string; qty: number; unit: string; unitCost: number; lineCost: number };
type MenuItem = { id: string; name: string; price: number; cost: number; ingredients: Ingredient[] };

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function HppCalculator({ menuItems }: { menuItems: MenuItem[] }) {
  const [selectedId, setSelectedId] = useState(menuItems[0]?.id ?? "");
  const [trialPrice, setTrialPrice] = useState("");
  const [targetMargin, setTargetMargin] = useState("");

  const selected = menuItems.find((m) => m.id === selectedId) ?? null;

  const totalHpp = useMemo(
    () => selected?.ingredients.reduce((s, i) => s + i.lineCost, 0) ?? 0,
    [selected],
  );

  const trialPriceNum = Number(trialPrice) || 0;
  const trialMargin = trialPriceNum > 0 ? trialPriceNum - totalHpp : null;
  const trialMarginPct = trialPriceNum > 0 ? Math.round((trialMargin! / trialPriceNum) * 100) : null;

  const targetMarginNum = Number(targetMargin);
  const suggestedPrice =
    targetMargin !== "" && targetMarginNum >= 0 && targetMarginNum < 100
      ? Math.round(totalHpp / (1 - targetMarginNum / 100))
      : null;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <label className="mb-1 block text-xs font-medium text-zinc-600">Pilih Menu</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {menuItems.length === 0 && <option value="">Belum ada menu/produk</option>}
          {menuItems.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3.5">
              <h2 className="text-sm font-bold text-zinc-900">Rincian Bahan — {selected.name}</h2>
            </div>
            {selected.ingredients.length > 0 ? (
              <div className="divide-y divide-zinc-100">
                {selected.ingredients.map((ing, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-zinc-700">
                      {ing.name}{" "}
                      <span className="text-zinc-400">
                        ({ing.qty} {ing.unit})
                      </span>
                    </span>
                    <span className="text-sm font-medium text-zinc-900">
                      {formatRupiah(ing.lineCost)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-xs text-zinc-400">
                Menu ini belum punya resep. Tambahkan dulu di halaman Kelola Produk → Resep.
              </p>
            )}
            <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-4 py-3">
              <span className="text-sm font-bold text-zinc-900">Total HPP</span>
              <span className="text-sm font-bold text-brand-700">{formatRupiah(totalHpp)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-bold text-zinc-900">Uji Harga Jual</h2>
              <p className="mt-0.5 text-[11px] text-zinc-400">Isi harga jual, lihat marginnya</p>
              <input
                type="number"
                min="0"
                value={trialPrice}
                onChange={(e) => setTrialPrice(e.target.value)}
                placeholder={String(selected.price)}
                className="mt-3 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              {trialMargin !== null && (
                <p className="mt-2 text-xs text-zinc-500">
                  Margin: <span className="font-semibold text-zinc-900">{formatRupiah(trialMargin)}</span>{" "}
                  ({trialMarginPct}%)
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-bold text-zinc-900">Target Margin</h2>
              <p className="mt-0.5 text-[11px] text-zinc-400">Isi target %, lihat saran harga</p>
              <input
                type="number"
                min="0"
                max="99"
                value={targetMargin}
                onChange={(e) => setTargetMargin(e.target.value)}
                placeholder="mis. 30"
                className="mt-3 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              {suggestedPrice !== null && (
                <p className="mt-2 text-xs text-zinc-500">
                  Saran harga jual:{" "}
                  <span className="font-semibold text-zinc-900">{formatRupiah(suggestedPrice)}</span>
                </p>
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-zinc-400">
            Harga jual saat ini di produk: {formatRupiah(selected.price)} · HPP tersimpan:{" "}
            {formatRupiah(selected.cost)}
          </p>
        </>
      )}
    </div>
  );
}
