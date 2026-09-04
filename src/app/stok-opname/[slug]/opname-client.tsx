"use client";

import { useMemo, useState } from "react";
import { submitStockOpname } from "./actions";

type ItemOption = { id: string; name: string; unit: string; currentStock: number };
type Employee = { id: string; name: string };

// Sengaja di LUAR OpnameClient (module scope), bukan didefinisikan lagi di
// tiap render -- kalau di dalam, React anggap ini komponen BARU tiap parent
// re-render (mis. tiap ketik 1 karakter lewat setValues), jadi input-nya
// di-remount & kehilangan fokus setelah 1 keystroke (harus klik lagi tiap
// ketik 1 digit).
function ItemRow({
  item,
  itemKey,
  value,
  onChange,
}: {
  item: ItemOption;
  itemKey: string;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
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
        value={value}
        onChange={(e) => onChange(itemKey, e.target.value)}
        className="w-24 shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-right text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}

function todayLabel() {
  return new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

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
  const [step, setStep] = useState<"input" | "review">("input");
  const [formError, setFormError] = useState<string | null>(null);

  const filledCount = useMemo(
    () => Object.values(values).filter((v) => v.trim() !== "").length,
    [values],
  );

  function handleValueChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function filterItems(items: ItemOption[]) {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }

  function buildCounts() {
    const ingredientCounts = ingredients
      .filter((i) => values[`ing:${i.id}`]?.trim())
      .map((i) => ({ id: i.id, stock: Number(values[`ing:${i.id}`]) }));
    const semiFinishedCounts = semiFinishedItems
      .filter((s) => values[`semi:${s.id}`]?.trim())
      .map((s) => ({ id: s.id, stock: Number(values[`semi:${s.id}`]) }));
    return { ingredientCounts, semiFinishedCounts };
  }

  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!employeeId) {
      setFormError("Pilih nama dulu.");
      return;
    }

    const { ingredientCounts, semiFinishedCounts } = buildCounts();

    if (ingredientCounts.some((c) => Number.isNaN(c.stock) || c.stock < 0)) {
      setFormError("Stok fisik harus angka dan tidak boleh negatif.");
      return;
    }
    if (semiFinishedCounts.some((c) => Number.isNaN(c.stock) || c.stock < 0)) {
      setFormError("Stok fisik harus angka dan tidak boleh negatif.");
      return;
    }
    if (ingredientCounts.length === 0 && semiFinishedCounts.length === 0) {
      setFormError("Isi minimal 1 bahan dulu.");
      return;
    }

    setStep("review");
  }

  async function handleConfirmSend() {
    setResult(null);
    const { ingredientCounts, semiFinishedCounts } = buildCounts();

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
    setStep("input");
  }

  const visibleIngredients = filterItems(ingredients);
  const visibleSemiFinished = filterItems(semiFinishedItems);

  const reviewRows = useMemo(() => {
    const rows: { key: string; name: string; unit: string; currentStock: number; reported: number }[] = [];
    for (const i of ingredients) {
      const raw = values[`ing:${i.id}`];
      if (raw?.trim()) rows.push({ key: `ing:${i.id}`, name: i.name, unit: i.unit, currentStock: i.currentStock, reported: Number(raw) });
    }
    for (const s of semiFinishedItems) {
      const raw = values[`semi:${s.id}`];
      if (raw?.trim()) rows.push({ key: `semi:${s.id}`, name: s.name, unit: s.unit, currentStock: s.currentStock, reported: Number(raw) });
    }
    return rows;
  }, [values, ingredients, semiFinishedItems]);

  if (step === "review") {
    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
        <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Tinjau Sebelum Kirim</h1>
        <p className="mt-1 text-center text-xs font-medium text-brand-700">{location.name} · {todayLabel()}</p>
        <p className="mt-2 text-center text-[11px] text-zinc-400">
          Cek lagi angka di bawah. Belum tersimpan ke sistem — masih bisa kembali dan ubah.
        </p>

        <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-zinc-200">
          {reviewRows.map((r) => {
            const diff = r.reported - r.currentStock;
            return (
              <div key={r.key} className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-800">{r.name}</p>
                  <p className="text-[11px] text-zinc-400">
                    Sistem: {r.currentStock.toLocaleString("id-ID")} {r.unit} → Diisi: {r.reported.toLocaleString("id-ID")} {r.unit}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-semibold ${
                    diff === 0 ? "text-zinc-400" : diff > 0 ? "text-brand-600" : "text-red-500"
                  }`}
                >
                  {diff > 0 ? "+" : ""}
                  {diff.toLocaleString("id-ID")}
                </span>
              </div>
            );
          })}
        </div>

        {result && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              result.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-600"
            }`}
          >
            {result.message}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setStep("input")}
            disabled={pending}
            className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ← Kembali, Edit Lagi
          </button>
          <button
            type="button"
            onClick={handleConfirmSend}
            disabled={pending}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Mengirim…" : `Kirim (${reviewRows.length} bahan)`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
      <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Stok Opname — {location.name}</h1>
      <p className="mt-1 text-center text-xs font-medium text-brand-700">{todayLabel()}</p>
      <p className="mt-1 text-center text-[11px] text-zinc-400">
        Isi stok fisik yang kamu hitung sekarang. Bahan yang tidak diisi tidak akan diubah.
      </p>

      <form onSubmit={handleReview} className="mt-4 space-y-4">
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
                <ItemRow
                  key={i.id}
                  item={i}
                  itemKey={`ing:${i.id}`}
                  value={values[`ing:${i.id}`] ?? ""}
                  onChange={handleValueChange}
                />
              ))}
            </div>
          </div>
        )}

        {visibleSemiFinished.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-zinc-700">Bahan Setengah Jadi</p>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-zinc-200 px-3">
              {visibleSemiFinished.map((s) => (
                <ItemRow
                  key={s.id}
                  item={s}
                  itemKey={`semi:${s.id}`}
                  value={values[`semi:${s.id}`] ?? ""}
                  onChange={handleValueChange}
                />
              ))}
            </div>
          </div>
        )}

        {formError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</p>
        )}

        <button
          type="submit"
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {`Tinjau Dulu${filledCount > 0 ? ` (${filledCount} bahan)` : ""}`}
        </button>
      </form>
    </div>
  );
}
