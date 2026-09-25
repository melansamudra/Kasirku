"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type BulkActionResult = { error?: string | null; skipped?: { name: string; reason: string }[] } | void;

export type BulkAction =
  | { key: string; label: string; kind: "delete"; confirmLabel: string; run: (ids: string[]) => Promise<BulkActionResult> }
  | {
      key: string;
      label: string;
      kind: "select";
      fieldLabel: string;
      options: { value: string; label: string }[];
      run: (ids: string[], value: string) => Promise<BulkActionResult>;
    }
  | {
      key: string;
      label: string;
      kind: "text";
      fieldLabel: string;
      placeholder?: string;
      run: (ids: string[], value: string) => Promise<BulkActionResult>;
    }
  | {
      key: string;
      label: string;
      kind: "percent";
      fieldLabel: string;
      run: (ids: string[], percent: number) => Promise<BulkActionResult>;
    };

// Toolbar generik untuk aksi massal (hapus/koreksi) dipakai bersama di
// halaman Bahan Baku, Bahan Setengah Jadi, dan Produk Jadi (HPP) -- tiap
// halaman tetap pegang sendiri state `selected`-nya (pola pencarian/filter
// per halaman beda-beda), toolbar ini cuma render UI aksinya.
export default function BulkActionBar({
  selectedIds,
  onClear,
  actions,
  itemLabel = "item",
}: {
  selectedIds: string[];
  onClear: () => void;
  actions: BulkAction[];
  itemLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[] | null>(null);

  if (selectedIds.length === 0) return null;

  function reset() {
    setOpenKey(null);
    setValue("");
  }

  function run(action: BulkAction, rawValue?: string) {
    setError(null);
    setSkipped(null);
    startTransition(async () => {
      const result =
        action.kind === "delete"
          ? await action.run(selectedIds)
          : action.kind === "percent"
            ? await action.run(selectedIds, Number(rawValue))
            : await action.run(selectedIds, rawValue ?? "");
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.skipped && result.skipped.length > 0) {
        setSkipped(result.skipped);
      }
      onClear();
      reset();
      router.refresh();
    });
  }

  return (
    <div className="sticky bottom-3 z-10 mt-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-zinc-700">
          {selectedIds.length} {itemLabel} terpilih
        </p>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {actions.map((action) => {
            if (openKey !== action.key) {
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => {
                    setOpenKey(action.key);
                    setValue("");
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    action.kind === "delete"
                      ? "border-red-200 text-red-600 hover:bg-red-50"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {action.kind === "delete" ? "🗑️" : "✏️"} {action.label}
                </button>
              );
            }
            if (action.kind === "delete") {
              return (
                <div key={action.key} className="flex items-center gap-2 rounded-lg bg-red-50 px-2 py-1">
                  <span className="text-xs text-red-700">{action.confirmLabel}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(action)}
                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Ya, Hapus
                  </button>
                  <button type="button" onClick={reset} className="text-xs text-zinc-500 hover:underline">
                    Batal
                  </button>
                </div>
              );
            }
            if (action.kind === "text") {
              return (
                <div key={action.key} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2 py-1">
                  <span className="text-xs text-zinc-600">{action.fieldLabel}</span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={action.placeholder}
                    className="w-40 rounded-md border border-zinc-200 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    disabled={pending || !value}
                    onClick={() => run(action, value)}
                    className="rounded-md bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    Terapkan
                  </button>
                  <button type="button" onClick={reset} className="text-xs text-zinc-500 hover:underline">
                    Batal
                  </button>
                </div>
              );
            }
            if (action.kind === "select") {
              return (
                <div key={action.key} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2 py-1">
                  <span className="text-xs text-zinc-600">{action.fieldLabel}</span>
                  <select
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs"
                  >
                    <option value="">Pilih…</option>
                    {action.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending || !value}
                    onClick={() => run(action, value)}
                    className="rounded-md bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    Terapkan
                  </button>
                  <button type="button" onClick={reset} className="text-xs text-zinc-500 hover:underline">
                    Batal
                  </button>
                </div>
              );
            }
            return (
              <div key={action.key} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2 py-1">
                <span className="text-xs text-zinc-600">{action.fieldLabel}</span>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="mis. 10 atau -5"
                  className="w-24 rounded-md border border-zinc-200 px-2 py-1 text-xs"
                />
                <span className="text-xs text-zinc-400">%</span>
                <button
                  type="button"
                  disabled={pending || !value}
                  onClick={() => run(action, value)}
                  className="rounded-md bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Terapkan
                </button>
                <button type="button" onClick={reset} className="text-xs text-zinc-500 hover:underline">
                  Batal
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={onClear} className="text-xs text-zinc-400 hover:underline">
          Batal pilih
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {skipped && skipped.length > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">{skipped.length} item dilewati:</p>
          <ul className="mt-1 list-disc pl-4">
            {skipped.map((s, i) => (
              <li key={i}>
                {s.name} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
