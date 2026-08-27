"use client";

import { useActionState, useRef, useEffect, useState, useMemo } from "react";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

// Konversi kemudahan input: resep tetap disimpan di satuan dasar bahan
// (gr/ml) seperti sebelumnya (server tidak berubah sama sekali) -- ini
// murni multiplier di sisi client sebelum submit, supaya staf yang biasa
// mikir dalam kiloan tidak perlu ketik "25000" tiap kali.
const CONVENIENCE_UNITS: Record<string, { label: string; factor: number }> = {
  gr: { label: "kg", factor: 1000 },
  ml: { label: "liter", factor: 1000 },
};

export default function RecipeEditor({
  action,
  ingredients,
  semiFinishedOptions,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  ingredients: { id: string; name: string; unit: string }[];
  semiFinishedOptions: { id: string; name: string; unit: string }[];
}) {
  const wrappedAction = async (state: ActionState, formData: FormData): Promise<ActionState> => {
    const qtyUnit = formData.get("qtyUnit") as string;
    const baseUnit = formData.get("baseUnit") as string;
    const convenience = CONVENIENCE_UNITS[baseUnit?.toLowerCase()];
    if (convenience && qtyUnit === convenience.label) {
      const qty = Number(formData.get("qty"));
      formData.set("qty", String(qty * convenience.factor));
    }
    return action(state, formData);
  };

  const [state, formAction, pending] = useActionState(wrappedAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [component, setComponent] = useState("");
  const [qtyUnit, setQtyUnit] = useState<string>("base");

  useEffect(() => {
    if (!pending && !state.error) {
      // formRef.current?.reset() adalah DOM mutation lewat ref — harus di
      // effect, tidak bisa "adjust during render". setState di bawah ikut
      // di sini karena triggernya sama (submit sukses).
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setComponent("");
      setQtyUnit("base");
    }
  }, [pending, state.error]);

  const noOptions = ingredients.length === 0 && semiFinishedOptions.length === 0;

  const selectedUnit = useMemo(() => {
    if (!component) return null;
    const [type, id] = component.split(":");
    const list = type === "ingredient" ? ingredients : semiFinishedOptions;
    return list.find((x) => x.id === id)?.unit ?? null;
  }, [component, ingredients, semiFinishedOptions]);

  const convenience = selectedUnit ? CONVENIENCE_UNITS[selectedUnit.toLowerCase()] : undefined;

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <label htmlFor="component" className="mb-1 block text-xs font-medium text-zinc-600">
          Komponen
        </label>
        <select
          id="component"
          name="component"
          required
          disabled={noOptions}
          value={component}
          onChange={(e) => {
            setComponent(e.target.value);
            setQtyUnit("base");
          }}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-zinc-50"
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
      <input type="hidden" name="baseUnit" value={selectedUnit ?? ""} />
      <div className="w-24">
        <label htmlFor="qty" className="mb-1 block text-xs font-medium text-zinc-600">
          Jumlah
        </label>
        <input
          id="qty"
          name="qty"
          type="number"
          step="0.0001"
          min="0.0001"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      {convenience && (
        <div className="w-24">
          <label htmlFor="qtyUnit" className="mb-1 block text-xs font-medium text-zinc-600">
            Satuan
          </label>
          <select
            id="qtyUnit"
            name="qtyUnit"
            value={qtyUnit}
            onChange={(e) => setQtyUnit(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="base">{selectedUnit}</option>
            <option value={convenience.label}>{convenience.label}</option>
          </select>
        </div>
      )}
      <button
        type="submit"
        disabled={pending || noOptions}
        className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah"}
      </button>
      {state.error && (
        <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}
      {noOptions && (
        <p className="w-full text-xs text-zinc-400">
          Belum ada bahan baku/bahan setengah jadi lain yang bisa dipakai sebagai komponen.
        </p>
      )}
    </form>
  );
}
