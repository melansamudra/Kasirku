"use client";

import { useMemo, useState } from "react";
import { submitStockOpname } from "./actions";

type ItemOption = { id: string; name: string; unit: string; currentStock: number };
type Employee = { id: string; name: string };

export default function OpnameClient({
  slug,
  businessName,
  location,
  employees,
  ingredients,
  semiFinishedItems,
}: {
  slug: string;
  businessName: string;
  location: { id: string; name: string };
  employees: Employee[];
  ingredients: ItemOption[];
  semiFinishedItems: ItemOption[];
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const filledCount = useMemo(
    () => Object.values(values).filter((v) => v.trim() !== "").length,
    [values],
  );

  function filterItems(items: ItemOption[]) {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!employeeId) {
      setResult({ ok: false, message: "Pilih nama dulu." });
      return;
    }

    const ingredientCounts = ingredients
      .filter((i) => values[`ing:${i.id}`]?.trim())
      .map((i) => ({ id: i.id, stock: Number(values[`ing:${i.id}`]) }));
    const semiFinishedCounts = semiFinishedItems
      .filter((s) => values[`semi:${s.id}`]?.trim())
      .map((s) => ({ id: s.id, stock: Number(values[`semi:${s.id}`]) }));

    if (ingredientCounts.some((c) => Number.isNaN(c.stock) || c.stock < 0)) {
      setResult({ ok: false, message: "Stok fisik harus angka dan tidak boleh negatif." });
      return;
    }
    if (semiFinishedCounts.some((c) => Number.isNaN(c.stock) || c.stock < 0)) {
      setResult({ ok: false, message: "Stok fisik harus angka dan tidak boleh negatif." });
      return;
    }
    if (ingredientCounts.length === 0 && semiFinishedCounts.length === 0) {
      setResult({ ok: false, message: "Isi minimal 1 bahan dulu." });
      return;
    }

    setPending(true);
    const res = await submitStockOpname(slug, employeeId, location.id, ingredientCounts, semiFinishedCounts);
    setPending(false);

    if (!res.success) {
      setResult({ ok: false, message: res.error });
      return;
    }

    setResult({
      ok: true,
      message:
        res.adjustedCount > 0
          ? `Tersimpan! ${res.adjustedCount} bahan disesuaikan.`
          : "Terkirim — tidak ada stok yang beda dari sistem, jadi tidak ada yang disesuaikan.",
    });
    setValues({});
  }

  function ItemRow({ item, prefix }: { item: ItemOption; prefix: "ing" | "semi" }) {
    const key = `${prefix}:${item.id}`;
    return (
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 py-2 last:border-0">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-zinc-800">{item.name}</p>
          <p className="text-[11px] text-zinc-400">
            Sistem: {item.currentStock.toLocaleString("id-ID")} {item.unit}
          </p>
        </div>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder={item.unit}
          value={values[key] ?? ""}
          onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
          className="w-24 shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-right text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
    );
  }

  const visibleIngredients = filterItems(ingredients);
  const visibleSemiFinished = filterItems(semiFinishedItems);

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
      <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Stok Opname — {location.name}</h1>
      <p className="mt-1 text-center text-[11px] text-zinc-400">
        Isi stok fisik yang kamu hitung sekarang. Bahan yang tidak diisi tidak akan diubah.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Anda</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Pilih nama —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Cari Bahan (opsional)</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik nama bahan…"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {visibleIngredients.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-zinc-700">Bahan Baku</p>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-zinc-200 px-3">
              {visibleIngredients.map((i) => (
                <ItemRow key={i.id} item={i} prefix="ing" />
              ))}
            </div>
          </div>
        )}

        {visibleSemiFinished.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-zinc-700">Bahan Setengah Jadi</p>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-zinc-200 px-3">
              {visibleSemiFinished.map((s) => (
                <ItemRow key={s.id} item={s} prefix="semi" />
              ))}
            </div>
          </div>
        )}

        {result && (
          <p
            className={`rounded-lg px-3 py-2 text-xs ${
              result.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-600"
            }`}
          >
            {result.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Mengirim…" : `Kirim Stok Opname${filledCount > 0 ? ` (${filledCount} bahan)` : ""}`}
        </button>
      </form>
    </div>
  );
}
