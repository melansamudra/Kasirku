"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { BulkAddState, BulkComponentInput } from "./actions";

const CONVENIENCE_UNITS: Record<string, { label: string; factor: number }> = {
  gr: { label: "kg", factor: 1000 },
  ml: { label: "liter", factor: 1000 },
};

type Option = { id: string; name: string; unit: string };
type PendingRow = {
  key: string;
  componentType: "ingredient" | "semi_finished";
  componentId: string;
  name: string;
  unit: string;
  displayQty: number;
  displayUnit: string;
  finalQty: number; // sudah dinormalisasi ke per-1-satuan-hasil, siap dikirim ke server
};

const initialState: BulkAddState = { error: null };

// Ganti pola "tambah satu, langsung tersimpan" (RecipeEditor) -- di sini
// user kumpulkan dulu beberapa baris lewat dropdown (belum tersimpan),
// baru satu tombol "Simpan Semua" mengirim semuanya sekaligus lewat
// addRecipeComponentsBulk (action yang sama dipakai RecipeBulkAdd/paste).
export default function RecipeDropdownMultiAdd({
  action,
  ingredients,
  semiFinishedOptions,
  batchYieldQty,
  resultUnit,
}: {
  action: (state: BulkAddState, formData: FormData) => Promise<BulkAddState>;
  ingredients: Option[];
  semiFinishedOptions: Option[];
  batchYieldQty?: number | null;
  resultUnit?: string;
}) {
  const hasBatchMode = !!batchYieldQty && batchYieldQty > 0 && batchYieldQty !== 1;

  const [component, setComponent] = useState("");
  const [qty, setQty] = useState("");
  const [qtyUnit, setQtyUnit] = useState<string>("base");
  const [scaleMode, setScaleMode] = useState<string>(hasBatchMode ? "batch" : "unit");
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [addError, setAddError] = useState<string | null>(null);

  const noOptions = ingredients.length === 0 && semiFinishedOptions.length === 0;

  const selectedUnit = useMemo(() => {
    if (!component) return null;
    const [type, id] = component.split(":");
    const list = type === "ingredient" ? ingredients : semiFinishedOptions;
    return list.find((x) => x.id === id)?.unit ?? null;
  }, [component, ingredients, semiFinishedOptions]);

  const convenience = selectedUnit ? CONVENIENCE_UNITS[selectedUnit.toLowerCase()] : undefined;

  function addToPending() {
    setAddError(null);
    if (!component) {
      setAddError("Pilih komponen dulu.");
      return;
    }
    const qtyNum = Number(qty);
    if (!(qtyNum > 0)) {
      setAddError("Jumlah harus lebih dari 0.");
      return;
    }
    const [type, id] = component.split(":") as ["ingredient" | "semi_finished", string];
    const list = type === "ingredient" ? ingredients : semiFinishedOptions;
    const opt = list.find((x) => x.id === id);
    if (!opt) return;

    let finalQty = qtyNum;
    if (convenience && qtyUnit === convenience.label) {
      finalQty = finalQty * convenience.factor;
    }
    if (hasBatchMode && scaleMode === "batch") {
      finalQty = finalQty / batchYieldQty!;
    }

    setPending((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random()}`,
        componentType: type,
        componentId: id,
        name: opt.name,
        unit: opt.unit,
        displayQty: qtyNum,
        displayUnit: qtyUnit === "base" ? opt.unit : qtyUnit,
        finalQty,
      },
    ]);
    setComponent("");
    setQty("");
    setQtyUnit("base");
  }

  function removePending(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key));
  }

  const wrappedAction = async (state: BulkAddState, formData: FormData): Promise<BulkAddState> => {
    const items: BulkComponentInput[] = pending.map((p) => ({
      componentType: p.componentType,
      componentId: p.componentId,
      qty: p.finalQty,
    }));
    formData.set("items", JSON.stringify(items));
    return action(state, formData);
  };

  const [state, formAction, saving] = useActionState(wrappedAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!saving && !state.error && state.added !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending([]);
    }
  }, [saving, state.error, state.added]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold text-zinc-700">Tambah Komponen</p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="dd-component" className="mb-1 block text-xs font-medium text-zinc-600">
            Komponen
          </label>
          <select
            id="dd-component"
            disabled={noOptions}
            value={component}
            onChange={(e) => {
              setComponent(e.target.value);
              setQtyUnit("base");
            }}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-zinc-100"
          >
            <option value="">Pilih komponen…</option>
            {ingredients.length > 0 && (
              <optgroup label="Bahan Baku">
                {ingredients.map((i) => (
                  <option key={i.id} value={`ingredient:${i.id}`}>
                    {i.name} ({i.unit})
                  </option>
                ))}
              </optgroup>
            )}
            {semiFinishedOptions.length > 0 && (
              <optgroup label="Bahan Setengah Jadi">
                {semiFinishedOptions.map((s) => (
                  <option key={s.id} value={`semi_finished:${s.id}`}>
                    {s.name} ({s.unit})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {hasBatchMode && (
          <div className="w-40">
            <label htmlFor="dd-scaleMode" className="mb-1 block text-xs font-medium text-zinc-600">
              Jumlah untuk
            </label>
            <select
              id="dd-scaleMode"
              value={scaleMode}
              onChange={(e) => setScaleMode(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="batch">
                1 batch ({batchYieldQty} {resultUnit || "satuan"})
              </option>
              <option value="unit">1 {resultUnit || "satuan"} hasil</option>
            </select>
          </div>
        )}
        <div className="w-24">
          <label htmlFor="dd-qty" className="mb-1 block text-xs font-medium text-zinc-600">
            Jumlah
          </label>
          <input
            id="dd-qty"
            type="number"
            step="0.0001"
            min="0.0001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addToPending();
              }
            }}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        {convenience && (
          <div className="w-24">
            <label htmlFor="dd-qtyUnit" className="mb-1 block text-xs font-medium text-zinc-600">
              Satuan
            </label>
            <select
              id="dd-qtyUnit"
              value={qtyUnit}
              onChange={(e) => setQtyUnit(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="base">{selectedUnit}</option>
              <option value={convenience.label}>{convenience.label}</option>
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={addToPending}
          disabled={noOptions}
          className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          + Tambah ke daftar
        </button>
      </div>
      {addError && <p className="mt-1.5 text-xs text-red-600">{addError}</p>}
      {noOptions && (
        <p className="mt-1.5 text-xs text-zinc-400">
          Belum ada bahan baku/bahan setengah jadi lain yang bisa dipakai sebagai komponen.
        </p>
      )}

      {pending.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {pending.map((p) => (
            <div
              key={p.key}
              className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs text-zinc-700"
            >
              <span>
                {p.name} — {p.displayQty} {p.displayUnit}
              </span>
              <button
                type="button"
                onClick={() => removePending(p.key)}
                className="text-zinc-400 hover:text-red-500"
                title="Batalkan baris ini"
              >
                ✕
              </button>
            </div>
          ))}

          <form ref={formRef} action={formAction} className="pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Menyimpan…" : `Simpan ${pending.length} Bahan`}
            </button>
          </form>
        </div>
      )}

      {state.error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}
      {state.skipped && state.skipped.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {state.skipped.length} baris dilewati karena bikin siklus BOM: {state.skipped.join(", ")}
        </p>
      )}
    </div>
  );
}
