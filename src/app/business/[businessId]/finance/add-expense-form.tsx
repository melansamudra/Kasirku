"use client";

import { useActionState, useRef, useState, useEffect } from "react";
import type { ExpenseState } from "./actions";

const initialState: ExpenseState = { error: null };

const OTHER_CATEGORIES = [
  "Sewa",
  "Gaji & Upah",
  "Listrik & Air",
  "Marketing",
  "Perlengkapan",
  "Lain-lain",
];

const PURCHASE_INGREDIENT_CATEGORY = "Pembelian Bahan Baku";
const PURCHASE_PRODUCT_CATEGORY = "Pembelian Barang Dagang";

type IngredientOption = { id: string; name: string; unit: string; stock: number };
type ProductOption = { id: string; name: string; stock: number };

export default function AddExpenseForm({
  action,
  today,
  isFnb,
  ingredients,
  products,
}: {
  action: (state: ExpenseState, formData: FormData) => Promise<ExpenseState>;
  today: string;
  isFnb: boolean;
  ingredients: IngredientOption[];
  products: ProductOption[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [category, setCategory] = useState(
    isFnb ? PURCHASE_INGREDIENT_CATEGORY : PURCHASE_PRODUCT_CATEGORY,
  );
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  const isIngredientPurchase = category === PURCHASE_INGREDIENT_CATEGORY;
  const isProductPurchase = category === PURCHASE_PRODUCT_CATEGORY;
  const selectedIngredient = ingredients.find((i) => i.id === ingredientId);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="date" className="mb-1 block text-xs font-medium text-zinc-600">
            Tanggal
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={today}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-xs font-medium text-zinc-600">
            Kategori
          </label>
          <select
            id="category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {isFnb && (
              <option value={PURCHASE_INGREDIENT_CATEGORY}>{PURCHASE_INGREDIENT_CATEGORY}</option>
            )}
            <option value={PURCHASE_PRODUCT_CATEGORY}>{PURCHASE_PRODUCT_CATEGORY}</option>
            {OTHER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isIngredientPurchase && (
        <div className="space-y-2 rounded-xl bg-amber-50 p-3">
          <div>
            <label htmlFor="ingredientId" className="mb-1 block text-xs font-medium text-amber-800">
              Bahan yang Dibeli
            </label>
            <select
              id="ingredientId"
              name="ingredientId"
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {ingredients.length === 0 && <option value="">Belum ada bahan baku</option>}
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} (stok: {i.stock} {i.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="qty-ing" className="mb-1 block text-xs font-medium text-amber-800">
                Qty Dibeli
              </label>
              <input
                id="qty-ing"
                name="qty"
                type="number"
                min="0"
                step="0.01"
                placeholder="1000"
                required
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-amber-800">Satuan</label>
              <input
                type="text"
                readOnly
                value={selectedIngredient?.unit ?? ""}
                className="w-full rounded-xl border border-amber-200 bg-amber-100/50 px-3 py-2.5 text-sm text-amber-900"
              />
            </div>
          </div>
          <p className="text-[10.5px] text-amber-700/80">
            Stok bahan ini otomatis bertambah sesuai qty, harga/satuan disesuaikan (rata-rata
            tertimbang).
          </p>
        </div>
      )}

      {isProductPurchase && (
        <div className="space-y-2 rounded-xl bg-blue-50 p-3">
          <div>
            <label htmlFor="productId" className="mb-1 block text-xs font-medium text-blue-800">
              Produk yang Dibeli
            </label>
            <select
              id="productId"
              name="productId"
              className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {products.length === 0 && <option value="">Belum ada produk</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (stok: {p.stock})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="qty-prod" className="mb-1 block text-xs font-medium text-blue-800">
              Qty Dibeli
            </label>
            <input
              id="qty-prod"
              name="qty"
              type="number"
              min="0"
              step="0.01"
              placeholder="50"
              required
              className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <p className="text-[10.5px] text-blue-700/80">
            Stok produk ini otomatis bertambah sesuai qty, harga modal disesuaikan (rata-rata
            tertimbang).
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="amount" className="mb-1 block text-xs font-medium text-zinc-600">
            {isIngredientPurchase || isProductPurchase ? "Total Harga Pembelian (Rp)" : "Jumlah (Rp)"}
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="1"
            placeholder="500000"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="note" className="mb-1 block text-xs font-medium text-zinc-600">
            Catatan (opsional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            placeholder="mis. sewa bulan Juli"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah Pengeluaran"}
      </button>
    </form>
  );
}
