"use client";

import { useActionState, useMemo, useRef, useState, useEffect } from "react";
import type { BulkAddState, BulkComponentInput } from "./actions";

const initialState: BulkAddState = { error: null };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Sama seperti RecipeEditor: staf boleh nulis dalam kg/liter, disimpan tetap
// dalam satuan dasar (gr/ml) -- dikonversi di sini sebelum dikirim.
const CONVENIENCE_UNITS: Record<string, { label: string; factor: number }> = {
  gr: { label: "kg", factor: 1000 },
  ml: { label: "liter", factor: 1000 },
};

type Option = { id: string; name: string; unit: string };

type ParsedLine = {
  raw: string;
  name: string;
  qtyText: string;
  unitText: string;
  match: (Option & { componentType: "ingredient" | "semi_finished" }) | null;
  finalQty: number | null;
};

export default function RecipeBulkAdd({
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
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const hasBatchMode = !!batchYieldQty && batchYieldQty > 0 && batchYieldQty !== 1;
  const [scaleMode, setScaleMode] = useState<"batch" | "unit">(hasBatchMode ? "batch" : "unit");

  const nameIndex = useMemo(() => {
    const map = new Map<string, Option & { componentType: "ingredient" | "semi_finished" }>();
    for (const i of ingredients) map.set(norm(i.name), { ...i, componentType: "ingredient" });
    for (const s of semiFinishedOptions) if (!map.has(norm(s.name))) map.set(norm(s.name), { ...s, componentType: "semi_finished" });
    return map;
  }, [ingredients, semiFinishedOptions]);

  const parsedLines: ParsedLine[] = useMemo(() => {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((raw) => {
        const cols = raw.includes("\t") ? raw.split("\t") : raw.split(",");
        const name = (cols[0] ?? "").trim();
        const qtyText = (cols[1] ?? "").trim();
        const unitText = (cols[2] ?? "").trim();
        const match = nameIndex.get(norm(name)) ?? null;

        let finalQty: number | null = null;
        const qtyNum = Number(qtyText.replace(",", "."));
        if (match && qtyNum > 0) {
          let qty = qtyNum;
          const convenience = CONVENIENCE_UNITS[match.unit.toLowerCase()];
          if (convenience && unitText && norm(unitText) === norm(convenience.label)) {
            qty = qty * convenience.factor;
          }
          if (hasBatchMode && scaleMode === "batch") {
            qty = qty / batchYieldQty!;
          }
          finalQty = qty;
        }

        return { raw, name, qtyText, unitText, match, finalQty };
      });
  }, [text, nameIndex, hasBatchMode, scaleMode, batchYieldQty]);

  const validLines = parsedLines.filter((l) => l.match && l.finalQty !== null);
  const invalidLines = parsedLines.filter((l) => !l.match || l.finalQty === null);

  const wrappedAction = async (state: BulkAddState, formData: FormData): Promise<BulkAddState> => {
    const items: BulkComponentInput[] = validLines.map((l) => ({
      componentType: l.match!.componentType,
      componentId: l.match!.id,
      qty: l.finalQty!,
    }));
    formData.set("items", JSON.stringify(items));
    return action(state, formData);
  };

  const [state, formAction, pending] = useActionState(wrappedAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error && state.added !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText("");
      setOpen(false);
    }
  }, [pending, state.error, state.added]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand-600 hover:underline"
      >
        📋 Tempel banyak bahan sekaligus
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-700">Tempel banyak bahan sekaligus</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-600">
          Tutup
        </button>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">
        Satu bahan per baris: <code className="rounded bg-white px-1">Nama Bahan, Jumlah, Satuan(opsional)</code> —
        bisa juga tempel langsung dari Excel (kolom dipisah Tab). Satuan boleh kosong (pakai satuan dasar bahan) atau
        kg/liter kalau bahannya gr/ml.
      </p>

      {hasBatchMode && (
        <div className="mt-2 w-48">
          <label htmlFor="bulkScaleMode" className="mb-1 block text-xs font-medium text-zinc-600">
            Jumlah di bawah untuk
          </label>
          <select
            id="bulkScaleMode"
            value={scaleMode}
            onChange={(e) => setScaleMode(e.target.value as "batch" | "unit")}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="batch">1 batch ({batchYieldQty} {resultUnit || "satuan"})</option>
            <option value="unit">1 {resultUnit || "satuan"} hasil</option>
          </select>
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"Tillapia, 5000, gr\nTelur, 2\nSantan Kara, 100, ml"}
        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />

      {parsedLines.length > 0 && (
        <div className="mt-2 space-y-1">
          {validLines.length > 0 && (
            <p className="text-[11px] text-brand-600">✓ {validLines.length} baris siap ditambahkan.</p>
          )}
          {invalidLines.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              {invalidLines.length} baris dilewati (nama tidak cocok / jumlah tidak valid):
              <ul className="mt-0.5 list-disc pl-4">
                {invalidLines.slice(0, 8).map((l, i) => (
                  <li key={i}>{l.raw}</li>
                ))}
                {invalidLines.length > 8 && <li>… {invalidLines.length - 8} lainnya</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      <form ref={formRef} action={formAction} className="mt-2">
        <button
          type="submit"
          disabled={pending || validLines.length === 0}
          className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : `Tambahkan ${validLines.length > 0 ? validLines.length : ""} Bahan`}
        </button>
      </form>

      {state.error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}
      {state.skipped && state.skipped.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {state.skipped.length} baris dilewati karena bikin siklus BOM: {state.skipped.join(", ")}
        </p>
      )}
    </div>
  );
}
