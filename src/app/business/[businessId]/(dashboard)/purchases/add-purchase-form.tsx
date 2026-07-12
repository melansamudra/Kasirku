"use client";

import { useActionState, useState } from "react";
import type { AddPurchaseState } from "./actions";

const initialState: AddPurchaseState = { error: null, resetToken: 0 };

type SupplierOption = { id: string; name: string };
type IngredientOption = { id: string; name: string; unit: string; stock: number };
type ProductOption = { id: string; name: string; stock: number };
export type PurchasePrefill = {
  category: "Bahan Baku" | "Barang Dagang";
  itemId: string;
  qty: number;
  amount: number;
};

export default function AddPurchaseForm({
  action,
  today,
  isFnb,
  suppliers,
  ingredients,
  products,
  prefill,
}: {
  action: (state: AddPurchaseState, formData: FormData) => Promise<AddPurchaseState>;
  today: string;
  isFnb: boolean;
  suppliers: SupplierOption[];
  ingredients: IngredientOption[];
  products: ProductOption[];
  prefill?: PurchasePrefill | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <PurchaseFormFields
      key={`${state.resetToken}-${prefill?.itemId ?? "none"}`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      today={today}
      isFnb={isFnb}
      suppliers={suppliers}
      ingredients={ingredients}
      products={products}
      prefill={prefill}
    />
  );
}

function PurchaseFormFields({
  formAction,
  pending,
  error,
  today,
  isFnb,
  suppliers,
  ingredients,
  products,
  prefill,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  today: string;
  isFnb: boolean;
  suppliers: SupplierOption[];
  ingredients: IngredientOption[];
  products: ProductOption[];
  prefill?: PurchasePrefill | null;
}) {
  const [category, setCategory] = useState<string>(
    prefill?.category ?? (isFnb ? "Bahan Baku" : "Barang Dagang"),
  );
  const [ingredientId, setIngredientId] = useState(
    prefill?.category === "Bahan Baku" ? prefill.itemId : ingredients[0]?.id ?? "",
  );
  const [amount, setAmount] = useState(prefill ? String(prefill.amount) : "");
  const [paymentMode, setPaymentMode] = useState<"lunas" | "utang" | "sebagian">("lunas");
  const [paidAmount, setPaidAmount] = useState("");

  const isIngredientPurchase = category === "Bahan Baku";
  const selectedIngredient = ingredients.find((i) => i.id === ingredientId);

  const effectivePaidAmount =
    paymentMode === "lunas" ? amount : paymentMode === "utang" ? "0" : paidAmount;

  return (
    <form action={formAction} className="space-y-3">
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
          <label htmlFor="supplierId" className="mb-1 block text-xs font-medium text-zinc-600">
            Supplier (opsional)
          </label>
          <select
            id="supplierId"
            name="supplierId"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Tanpa supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isFnb && (
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
            <option value="Bahan Baku">Bahan Baku</option>
            <option value="Barang Dagang">Barang Dagang</option>
          </select>
        </div>
      )}
      {!isFnb && <input type="hidden" name="category" value="Barang Dagang" />}

      {isIngredientPurchase ? (
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
              <label htmlFor="qty" className="mb-1 block text-xs font-medium text-amber-800">
                Qty Dibeli
              </label>
              <input
                id="qty"
                name="qty"
                type="number"
                min="0"
                step="0.01"
                placeholder="1000"
                required
                defaultValue={prefill?.category === "Bahan Baku" ? prefill.qty : undefined}
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
            Stok bahan ini otomatis bertambah, harga/satuan disesuaikan (rata-rata tertimbang).
          </p>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl bg-blue-50 p-3">
          <div>
            <label htmlFor="productId" className="mb-1 block text-xs font-medium text-blue-800">
              Produk yang Dibeli
            </label>
            <select
              id="productId"
              name="productId"
              defaultValue={prefill?.category === "Barang Dagang" ? prefill.itemId : undefined}
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
            <label htmlFor="qty" className="mb-1 block text-xs font-medium text-blue-800">
              Qty Dibeli
            </label>
            <input
              id="qty"
              name="qty"
              type="number"
              min="0"
              step="0.01"
              placeholder="50"
              required
              defaultValue={prefill?.category === "Barang Dagang" ? prefill.qty : undefined}
              className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <p className="text-[10.5px] text-blue-700/80">
            Stok produk ini otomatis bertambah, harga modal disesuaikan (rata-rata tertimbang).
          </p>
        </div>
      )}

      <div>
        <label htmlFor="amount" className="mb-1 block text-xs font-medium text-zinc-600">
          Total Harga Pembelian (Rp)
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          min="0"
          step="1"
          placeholder="500000"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Status Bayar</label>
        <div className="flex gap-1.5">
          {(
            [
              { key: "lunas", label: "Lunas Sekarang" },
              { key: "sebagian", label: "Bayar Sebagian" },
              { key: "utang", label: "Semua Utang" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPaymentMode(opt.key)}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                paymentMode === opt.key
                  ? "bg-brand-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {paymentMode === "sebagian" && (
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Jumlah dibayar sekarang (Rp)"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        )}
        <input type="hidden" name="paidAmount" value={effectivePaidAmount} />
      </div>

      <div>
        <label htmlFor="note" className="mb-1 block text-xs font-medium text-zinc-600">
          Catatan (opsional)
        </label>
        <input
          id="note"
          name="note"
          type="text"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Catat Pembelian"}
      </button>
    </form>
  );
}
