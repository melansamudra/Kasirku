"use client";

import { useId, useMemo, useState } from "react";
import { submitProductionScan, type ReportedIngredientInput } from "./actions";

type Employee = { id: string; name: string };
type RecipeLine = { name: string; qtyPerUnit: number; unit: string; availableStock: number };
type MasterItem = { id: string; name: string; unit: string; stock: number; recipe: RecipeLine[] };
type MasterIngredient = { id: string; name: string; unit: string };

const NEW_INGREDIENT_VALUE = "__new__";

type IngredientRow = { key: string; ingredientId: string; newName: string; newUnit: string; qty: string };

function emptyIngredientRow(): IngredientRow {
  return { key: crypto.randomUUID(), ingredientId: "", newName: "", newUnit: "", qty: "" };
}

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

const normQuery = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Dulu ini <select> polos berisi SEMUA bahan baku (bisa 1000+ di bisnis yang
// sudah lama jalan) -- di HP, scroll ratusan opsi buat cari 1 nama nyaris
// mustahil, jadi staf keburu nyerah lalu pilih "+ Ketik nama baru..." dan
// ngetik bebas (sering asal satuan "PCS"), padahal bahannya SUDAH ADA --
// ini yang bikin bahan baku Llauk numpuk banyak duplikat. Combobox
// pencarian ini gantinya, supaya ketik 2-3 huruf langsung ketemu.
function IngredientCombobox({
  ingredients,
  value,
  onChange,
}: {
  ingredients: MasterIngredient[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = ingredients.find((i) => i.id === value);
  const isNew = value === NEW_INGREDIENT_VALUE;

  const q = normQuery(query);
  const filtered = q ? ingredients.filter((i) => normQuery(i.name).includes(q)) : ingredients;
  const shown = filtered.slice(0, 30);

  function pick(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : selected ? selected.name : ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={isNew ? "+ Bahan baru (ketik di bawah)" : "Cari bahan baku…"}
        className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
          {shown.map((i) => (
            <button
              key={i.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i.id)}
              className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-zinc-50"
            >
              {i.name} <span className="text-zinc-400">({i.unit})</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-2.5 py-1.5 text-xs text-zinc-400">Tidak ketemu.</p>}
          {filtered.length > shown.length && (
            <p className="px-2.5 py-1 text-[10px] text-zinc-400">
              +{filtered.length - shown.length} lainnya — perhalus kata kuncinya
            </p>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(NEW_INGREDIENT_VALUE)}
            className="block w-full border-t border-zinc-100 px-2.5 py-1.5 text-left text-xs font-medium text-brand-600 hover:bg-brand-50"
          >
            + Ketik nama baru…
          </button>
        </div>
      )}
    </div>
  );
}

export default function RequestClient({
  slug,
  businessName,
  employees,
  items,
  ingredients,
}: {
  slug: string;
  businessName: string;
  employees: Employee[];
  items: MasterItem[];
  ingredients: MasterIngredient[];
}) {
  const formId = useId();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [itemId, setItemId] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [qty, setQty] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [step, setStep] = useState<"input" | "review">("input");

  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));
  const selectedItem = items.find((i) => i.id === itemId);
  const qtyNum = Number(qty) || 0;
  const preview = useMemo(
    () => (selectedItem?.recipe ?? []).map((line) => ({ ...line, needed: line.qtyPerUnit * qtyNum })),
    [selectedItem, qtyNum],
  );

  function updateIngredientRow(key: string, patch: Partial<IngredientRow>) {
    setIngredientRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addIngredientRow() {
    setIngredientRows((prev) => [...prev, emptyIngredientRow()]);
  }
  function removeIngredientRow(key: string) {
    setIngredientRows((prev) => prev.filter((r) => r.key !== key));
  }

  function resetForm() {
    setItemId("");
    setNewName("");
    setNewUnit("");
    setQty("");
    setNote("");
    setIngredientRows([]);
  }

  function buildReportedIngredients(): ReportedIngredientInput[] | null {
    const reportedIngredients: ReportedIngredientInput[] = [];
    for (const row of ingredientRows) {
      const rowQty = Number(row.qty);
      if (!row.qty || Number.isNaN(rowQty) || rowQty <= 0) continue; // baris kosong dilewati
      if (row.ingredientId && row.ingredientId !== NEW_INGREDIENT_VALUE) {
        reportedIngredients.push({ ingredientId: row.ingredientId, qty: rowQty });
      } else if (row.newName.trim() && row.newUnit.trim()) {
        reportedIngredients.push({ newName: row.newName.trim(), newUnit: row.newUnit.trim(), qty: rowQty });
      } else {
        return null;
      }
    }
    return reportedIngredients;
  }

  function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (mode === "existing" && !itemId) {
      setResult({ ok: false, message: "Pilih bahan yang diproduksi dulu." });
      return;
    }
    if (mode === "new" && (!newName.trim() || !newUnit.trim())) {
      setResult({ ok: false, message: "Isi nama dan satuan bahan barunya." });
      return;
    }
    if (!qty || Number.isNaN(qtyNum) || qtyNum <= 0) {
      setResult({ ok: false, message: "Isi jumlah yang diproduksi (harus lebih dari 0)." });
      return;
    }
    if (buildReportedIngredients() === null) {
      setResult({ ok: false, message: "Lengkapi nama & satuan tiap baris bahan yang dipakai." });
      return;
    }

    setStep("review");
  }

  async function handleConfirmSend() {
    setResult(null);
    const reportedIngredients = buildReportedIngredients() ?? [];

    setPending(true);
    const res = await submitProductionScan(
      slug,
      mode === "existing" ? { itemId } : { newName, newUnit },
      qtyNum,
      employeeId,
      note,
      reportedIngredients,
    );
    setPending(false);

    if (!res.success) {
      setResult({ ok: false, message: res.error });
      return;
    }

    setResult({
      ok: true,
      message:
        mode === "new"
          ? "Tersimpan! Nanti ditentukan bahan ini digabung ke item lama atau dibuat baru."
          : "Tersimpan sebagai draft! Menunggu diverifikasi.",
    });
    resetForm();
    setStep("input");
  }

  if (step === "review") {
    const itemLabel = mode === "existing" ? (selectedItem?.name ?? "—") : `${newName} (bahan baru)`;
    const itemUnit = mode === "existing" ? (selectedItem?.unit ?? "") : newUnit;
    const employeeName = employees.find((e) => e.id === employeeId)?.name;
    const reportedRows = ingredientRows
      .filter((row) => row.qty && Number(row.qty) > 0)
      .map((row) => {
        const isNew = row.ingredientId === NEW_INGREDIENT_VALUE;
        const chosen = ingredientMap.get(row.ingredientId);
        const name = isNew ? row.newName : (chosen?.name ?? "—");
        const unit = isNew ? row.newUnit : (chosen?.unit ?? "");
        return { key: row.key, name, unit, qty: row.qty };
      });

    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
        <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Tinjau Sebelum Kirim</h1>
        <p className="mt-2 text-center text-[11px] text-zinc-400">
          Cek lagi data di bawah. Belum tersimpan — masih bisa kembali dan ubah.
        </p>

        <div className="mt-4 space-y-2 rounded-xl border border-zinc-200 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Bahan Diproduksi</span>
            <span className="font-medium text-zinc-900">{itemLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Jumlah</span>
            <span className="font-medium text-zinc-900">
              {qtyNum.toLocaleString("id-ID")} {itemUnit}
            </span>
          </div>
          {employeeName && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Nama</span>
              <span className="font-medium text-zinc-900">{employeeName}</span>
            </div>
          )}
          {note.trim() && (
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-zinc-500">Catatan</span>
              <span className="text-right font-medium text-zinc-900">{note}</span>
            </div>
          )}
        </div>

        {reportedRows.length > 0 && (
          <div className="mt-3 rounded-xl bg-zinc-50 p-3">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
              Bahan yang Benar-Benar Dipakai
            </p>
            <div className="space-y-1">
              {reportedRows.map((r) => (
                <div key={r.key} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600">{r.name}</span>
                  <span className="text-zinc-700">
                    {r.qty} {r.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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
            {pending ? "Mengirim…" : "Kirim ke Sistem"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
      <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Catat Produksi</h1>
      <p className="mt-1 text-center text-[11px] text-zinc-400">
        Pilih bahan setengah jadi yang baru selesai dibuat, isi jumlahnya. Tidak langsung mengubah
        stok — masuk dulu ke sistem, menunggu diverifikasi.
      </p>

      <form onSubmit={handleReview} className="mt-4 space-y-4">
        <div className="flex rounded-xl border border-zinc-200 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`flex-1 rounded-lg py-2 transition-colors ${
              mode === "existing" ? "bg-brand-600 text-white" : "text-zinc-500"
            }`}
          >
            Pilih dari daftar
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 rounded-lg py-2 transition-colors ${
              mode === "new" ? "bg-brand-600 text-white" : "text-zinc-500"
            }`}
          >
            Bahan baru
          </button>
        </div>

        {mode === "existing" ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Bahan Setengah Jadi</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">— Pilih bahan setengah jadi —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-dashed border-zinc-300 p-3">
            <p className="text-[11px] text-zinc-500">
              Belum ada di daftar? Ketik nama bahannya — nanti ditentukan digabung ke item lama
              atau dibuat item baru.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Bahan</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="mis. Sambal Matah"
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Satuan</label>
              <input
                type="text"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="porsi / gr / ml / pcs"
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor={`${formId}-qty`} className="mb-1 block text-xs font-medium text-zinc-600">
            Jumlah Diproduksi
            {mode === "existing" && selectedItem ? ` (${selectedItem.unit})` : mode === "new" && newUnit ? ` (${newUnit})` : ""}
          </label>
          <input
            id={`${formId}-qty`}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {mode === "existing" && selectedItem && (
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
              Resep standar (buat pembanding)
            </p>
            {preview.length === 0 ? (
              <p className="text-xs text-zinc-400">Item ini belum punya resep.</p>
            ) : (
              <div className="space-y-1">
                {preview.map((line) => {
                  const insufficient = qtyNum > 0 && line.needed > line.availableStock + 1e-9;
                  return (
                    <div key={line.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-600">{line.name}</span>
                      <span className={insufficient ? "font-semibold text-red-600" : "text-zinc-700"}>
                        {formatQty(line.needed)} {line.unit}
                        <span className="text-zinc-400"> / stok {formatQty(line.availableStock)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 p-3">
          <p className="mb-2 text-xs font-medium text-zinc-600">Bahan yang Benar-Benar Dipakai (opsional)</p>
          <p className="mb-2 text-[11px] text-zinc-400">
            Kalau bahan yang dipakai batch ini beda dari resep standar, catat di sini — akan
            dibandingkan sebelum diverifikasi.
          </p>
          <div className="space-y-2">
            {ingredientRows.map((row) => {
              const isNew = row.ingredientId === NEW_INGREDIENT_VALUE;
              const chosen = ingredientMap.get(row.ingredientId);
              return (
                <div key={row.key} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1.5">
                    <IngredientCombobox
                      ingredients={ingredients}
                      value={row.ingredientId}
                      onChange={(id) => updateIngredientRow(row.key, { ingredientId: id })}
                    />
                    {isNew && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          value={row.newName}
                          onChange={(e) => updateIngredientRow(row.key, { newName: e.target.value })}
                          placeholder="Nama bahan"
                          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                        <input
                          type="text"
                          value={row.newUnit}
                          onChange={(e) => updateIngredientRow(row.key, { newUnit: e.target.value })}
                          placeholder="Satuan (kg/gr/pcs)"
                          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                      </div>
                    )}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={row.qty}
                      onChange={(e) => updateIngredientRow(row.key, { qty: e.target.value })}
                      placeholder={`Jumlah${!isNew && chosen ? ` (${chosen.unit})` : ""}`}
                      className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeIngredientRow(row.key)}
                    className="mt-1.5 shrink-0 text-xs text-zinc-400 hover:text-red-600"
                  >
                    Hapus
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={addIngredientRow}
            className="mt-2 w-full rounded-lg border border-dashed border-zinc-300 py-2 text-xs font-medium text-zinc-500 hover:border-brand-300 hover:text-brand-700"
          >
            + Tambah Bahan
          </button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Anda (opsional)</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="mis. batch pagi"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

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
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Tinjau Dulu
        </button>
      </form>
    </div>
  );
}
