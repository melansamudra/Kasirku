"use client";

import { useMemo, useState } from "react";
import { submitStockOpname } from "./actions";

type ItemOption = { id: string; name: string; unit: string; currentStock: number; sectionIds?: string[] };
type Employee = { id: string; name: string };
type Section = { id: string; name: string };
type NewItemDraft = {
  tempId: string;
  name: string;
  type: "ingredient" | "semi_finished";
  unit: string;
  stock: string;
};

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

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", {
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
  sections,
  ingredients,
  semiFinishedItems,
}: {
  slug: string;
  businessName: string;
  location: { id: string; name: string };
  employees: Employee[];
  sections: Section[];
  ingredients: ItemOption[];
  semiFinishedItems: ItemOption[];
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [entryDate, setEntryDate] = useState(todayISO());
  const [sectionId, setSectionId] = useState("");
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [step, setStep] = useState<"input" | "review">("input");
  const [formError, setFormError] = useState<string | null>(null);

  const [newItems, setNewItems] = useState<NewItemDraft[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemType, setNewItemType] = useState<"ingredient" | "semi_finished">("ingredient");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemStock, setNewItemStock] = useState("");

  const filledCount = useMemo(
    () => Object.values(values).filter((v) => v.trim() !== "").length + newItems.length,
    [values, newItems],
  );

  function handleValueChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function addNewItemDraft() {
    setFormError(null);
    const name = newItemName.trim();
    const unit = newItemUnit.trim();
    if (!name) {
      setFormError("Nama bahan baru wajib diisi.");
      return;
    }
    if (!unit) {
      setFormError("Satuan bahan baru wajib diisi.");
      return;
    }
    const stockNum = Number(newItemStock);
    if (!newItemStock || Number.isNaN(stockNum) || stockNum < 0) {
      setFormError("Stok fisik bahan baru harus angka 0 atau lebih.");
      return;
    }
    setNewItems((prev) => [
      ...prev,
      { tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, type: newItemType, unit, stock: newItemStock },
    ]);
    setNewItemName("");
    setNewItemUnit("");
    setNewItemStock("");
  }

  function removeNewItemDraft(tempId: string) {
    setNewItems((prev) => prev.filter((n) => n.tempId !== tempId));
  }

  function filterItems(items: ItemOption[], applySectionFilter: boolean) {
    let result = items;
    if (applySectionFilter && sectionId) {
      result = result.filter((i) => (i.sectionIds ?? []).includes(sectionId));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    return result;
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
    if (ingredientCounts.length === 0 && semiFinishedCounts.length === 0 && newItems.length === 0) {
      setFormError("Isi minimal 1 bahan dulu.");
      return;
    }

    setStep("review");
  }

  async function handleConfirmSend() {
    setResult(null);
    const { ingredientCounts, semiFinishedCounts } = buildCounts();
    const newIngredients = newItems
      .filter((n) => n.type === "ingredient")
      .map((n) => ({ name: n.name, unit: n.unit, stock: Number(n.stock) }));
    const newSemiFinished = newItems
      .filter((n) => n.type === "semi_finished")
      .map((n) => ({ name: n.name, unit: n.unit, stock: Number(n.stock) }));

    setPending(true);
    const res = await submitStockOpname(
      slug,
      employeeId,
      location.id,
      ingredientCounts,
      semiFinishedCounts,
      entryDate,
      newIngredients,
      newSemiFinished,
      sectionId,
    );
    setPending(false);

    if (!res.success) {
      setResult({ ok: false, message: res.error });
      return;
    }

    setResult({
      ok: true,
      message: `Terkirim! ${res.entriesCount} bahan menunggu diverifikasi admin.`,
    });
    setValues({});
    setNewItems([]);
    setStep("input");
  }

  const visibleIngredients = filterItems(ingredients, true);
  const visibleSemiFinished = filterItems(semiFinishedItems, true);

  const sectionsWithCount = useMemo(
    () =>
      sections.map((s) => ({
        ...s,
        count:
          ingredients.filter((i) => (i.sectionIds ?? []).includes(s.id)).length +
          semiFinishedItems.filter((i) => (i.sectionIds ?? []).includes(s.id)).length,
      })),
    [sections, ingredients, semiFinishedItems],
  );

  const reviewRows = useMemo(() => {
    const rows: { key: string; name: string; unit: string; currentStock: number; reported: number; isNew: boolean }[] = [];
    for (const i of ingredients) {
      const raw = values[`ing:${i.id}`];
      if (raw?.trim()) rows.push({ key: `ing:${i.id}`, name: i.name, unit: i.unit, currentStock: i.currentStock, reported: Number(raw), isNew: false });
    }
    for (const s of semiFinishedItems) {
      const raw = values[`semi:${s.id}`];
      if (raw?.trim()) rows.push({ key: `semi:${s.id}`, name: s.name, unit: s.unit, currentStock: s.currentStock, reported: Number(raw), isNew: false });
    }
    for (const n of newItems) {
      rows.push({ key: n.tempId, name: n.name, unit: n.unit, currentStock: 0, reported: Number(n.stock), isNew: true });
    }
    return rows;
  }, [values, ingredients, semiFinishedItems, newItems]);

  if (step === "review") {
    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
        <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Tinjau Sebelum Kirim</h1>
        <p className="mt-1 text-center text-xs font-medium text-brand-700">{location.name} · {formatDateLabel(entryDate)}</p>
        <p className="mt-2 text-center text-[11px] text-zinc-400">
          Cek lagi angka di bawah. Belum tersimpan ke sistem — masih bisa kembali dan ubah.
        </p>

        <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-zinc-200">
          {reviewRows.map((r) => {
            const diff = r.reported - r.currentStock;
            return (
              <div key={r.key} className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-800">
                    {r.name}
                    {r.isNew && (
                      <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                        Baru
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {r.isNew
                      ? `Bahan baru — Diisi: ${r.reported.toLocaleString("id-ID")} ${r.unit}`
                      : `Sistem: ${r.currentStock.toLocaleString("id-ID")} ${r.unit} → Diisi: ${r.reported.toLocaleString("id-ID")} ${r.unit}`}
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
      <p className="mt-1 text-center text-xs font-medium text-brand-700">{formatDateLabel(entryDate)}</p>
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

        {sections.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Bagian</label>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">— Semua Bagian —</option>
              {sectionsWithCount.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.count} bahan)
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-zinc-400">
              Pilih bagian kamu supaya cuma bahan bagian itu yang tampil — tidak perlu scroll semua
              bahan.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Tanggal Opname</label>
          <input
            type="date"
            value={entryDate}
            max={todayISO()}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1 text-[11px] text-zinc-400">
            Default hari ini — ganti kalau opname ini baru sempat dicatat telat dari kejadian aslinya.
          </p>
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

        <div className="rounded-xl border border-dashed border-zinc-300 p-3">
          <p className="text-xs font-semibold text-zinc-700">+ Tambah Bahan Baru</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Bahan/BSJ belum ada di daftar di atas? Tambahkan di sini — harga/HPP-nya diisi admin
            belakangan.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Nama bahan"
              className="col-span-2 rounded-lg border border-zinc-200 px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none"
            />
            <select
              value={newItemType}
              onChange={(e) => setNewItemType(e.target.value as "ingredient" | "semi_finished")}
              className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none"
            >
              <option value="ingredient">Bahan Baku</option>
              <option value="semi_finished">Bahan Setengah Jadi</option>
            </select>
            <input
              type="text"
              value={newItemUnit}
              onChange={(e) => setNewItemUnit(e.target.value)}
              placeholder="Satuan (gr/pcs/dst)"
              className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none"
            />
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={newItemStock}
              onChange={(e) => setNewItemStock(e.target.value)}
              placeholder="Stok fisik"
              className="col-span-2 rounded-lg border border-zinc-200 px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={addNewItemDraft}
            className="mt-2 w-full rounded-lg bg-zinc-100 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            + Tambah ke Daftar
          </button>

          {newItems.length > 0 && (
            <div className="mt-2 space-y-1">
              {newItems.map((n) => (
                <div key={n.tempId} className="flex items-center justify-between rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-800">
                  <span>
                    {n.name} — {n.stock} {n.unit}
                    <span className="ml-1 text-brand-600">
                      ({n.type === "ingredient" ? "Bahan Baku" : "BSJ"})
                    </span>
                  </span>
                  <button type="button" onClick={() => removeNewItemDraft(n.tempId)} className="text-brand-600 hover:text-red-600">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
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
