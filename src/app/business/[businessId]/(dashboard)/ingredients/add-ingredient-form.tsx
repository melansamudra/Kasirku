"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { AddItemState } from "./actions";
import RecipeRowsBuilder from "../semi-finished-items/recipe-rows-builder";

const initialState: AddItemState = { error: null };

type ComponentOption = { id: string; name: string; unit: string };

export default function AddIngredientForm({
  action,
  costControlEnabled = false,
  semiFinishedOptions = [],
  ingredientOptions = [],
}: {
  action: (state: AddItemState, formData: FormData) => Promise<AddItemState>;
  costControlEnabled?: boolean;
  semiFinishedOptions?: ComponentOption[];
  ingredientOptions?: ComponentOption[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [itemType, setItemType] = useState<"ingredient" | "semi_finished">("ingredient");
  const [isManualCost, setIsManualCost] = useState(false);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="flex gap-2 rounded-xl bg-zinc-100 p-1">
        <button
          type="button"
          onClick={() => setItemType("ingredient")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            itemType === "ingredient" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
          }`}
        >
          Bahan Baku Biasa
        </button>
        <button
          type="button"
          onClick={() => setItemType("semi_finished")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            itemType === "semi_finished" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
          }`}
        >
          Bahan Setengah Jadi
        </button>
      </div>
      <input type="hidden" name="itemType" value={itemType} />

      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Bahan
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder={itemType === "ingredient" ? "mis. Kopi Bubuk" : "mis. Adonan Mie"}
        />
      </div>

      <div>
        <label htmlFor="barcode" className="mb-1 block text-xs font-medium text-zinc-600">
          Barcode (opsional)
        </label>
        <input
          id="barcode"
          name="barcode"
          type="text"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="Scan atau ketik kode barcode"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="unit" className="mb-1 block text-xs font-medium text-zinc-600">
            Satuan
          </label>
          <input
            id="unit"
            name="unit"
            type="text"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="gr"
          />
        </div>
        <div>
          <label htmlFor="minStock" className="mb-1 block text-xs font-medium text-zinc-600">
            Stok Minimum
          </label>
          <input
            id="minStock"
            name="minStock"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="0 = tanpa notifikasi"
          />
        </div>
      </div>

      {itemType === "ingredient" ? (
        <>
          <div>
            <label htmlFor="unitCost" className="mb-1 block text-xs font-medium text-zinc-600">
              Harga/Satuan
            </label>
            <input
              id="unitCost"
              name="unitCost"
              type="number"
              min="0"
              step="1"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="150"
            />
          </div>
          {costControlEnabled ? (
            <p className="text-xs text-zinc-400">
              Stok fisik diatur lewat menu Gudang Utama / Kitchen Llauk / dst di sidebar, bukan di
              sini.
            </p>
          ) : (
            <div>
              <label htmlFor="stock" className="mb-1 block text-xs font-medium text-zinc-600">
                Stok
              </label>
              <input
                id="stock"
                name="stock"
                type="number"
                min="0"
                step="1"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="2000"
              />
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4 rounded-xl border border-dashed border-zinc-200 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fluctuationPct" className="mb-1 block text-xs font-medium text-zinc-600">
                Fluktuasi/Susut (%)
              </label>
              <input
                id="fluctuationPct"
                name="fluctuationPct"
                type="number"
                min="0"
                max="99"
                step="1"
                defaultValue="0"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="category" className="mb-1 block text-xs font-medium text-zinc-600">
                Kategori (opsional)
              </label>
              <input
                id="category"
                name="category"
                type="text"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
            <input
              type="checkbox"
              name="isManualCost"
              checked={isManualCost}
              onChange={(e) => setIsManualCost(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-300"
            />
            HPP diisi manual (bukan dihitung dari komponen)
          </label>

          {isManualCost ? (
            <div>
              <label htmlFor="manualUnitCost" className="mb-1 block text-xs font-medium text-zinc-600">
                HPP per Satuan
              </label>
              <input
                id="manualUnitCost"
                name="manualUnitCost"
                type="number"
                min="0"
                step="1"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
                placeholder="5000"
              />
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-600">Komponen / Resep</p>
              <RecipeRowsBuilder ingredients={ingredientOptions} semiFinishedOptions={semiFinishedOptions} />
              <p className="mt-1 text-[11px] text-zinc-400">HPP dihitung otomatis dari harga komponen di atas.</p>
            </div>
          )}

          <div className="border-t border-zinc-100 pt-3">
            <label htmlFor="produceQty" className="mb-1 block text-xs font-medium text-zinc-600">
              Produksi Awal (opsional)
            </label>
            <input
              id="produceQty"
              name="produceQty"
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
              placeholder="Kosongkan kalau belum mau produksi sekarang"
            />
            <p className="mt-1 text-[11px] text-zinc-400">
              Isi qty di sini kalau mau langsung produksi sekarang -- stok komponen otomatis
              terpotong, stok bahan ini otomatis bertambah.
            </p>
          </div>
        </div>
      )}

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}
      {state.warnings && state.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {state.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Tambah Bahan"}
      </button>
    </form>
  );
}
