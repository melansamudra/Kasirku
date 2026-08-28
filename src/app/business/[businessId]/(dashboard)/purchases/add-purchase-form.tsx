"use client";

import { useActionState, useState } from "react";
import type { AddPurchaseState } from "./actions";

const initialState: AddPurchaseState = { error: null, resetToken: 0 };

type SupplierOption = { id: string; name: string };
type IngredientOption = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  purchase_units?: { unitName: string; conversion: number }[];
};
type ProductOption = { id: string; name: string; stock: number };
type ExpenseAccountOption = { code: string; name: string };
type LocationOption = { id: string; name: string };
export type PurchasePrefill = {
  category: "Bahan Baku" | "Barang Dagang" | "Lainnya";
  itemId: string;
  qty: number;
  amount: number;
  note?: string;
  supplierId?: string;
  qtyUnit?: string;
  fromAllocationId?: string;
};

export default function AddPurchaseForm({
  action,
  today,
  isFnb,
  suppliers,
  ingredients,
  products,
  expenseAccounts,
  locations,
  prefill,
}: {
  action: (state: AddPurchaseState, formData: FormData) => Promise<AddPurchaseState>;
  today: string;
  isFnb: boolean;
  suppliers: SupplierOption[];
  ingredients: IngredientOption[];
  products: ProductOption[];
  expenseAccounts: ExpenseAccountOption[];
  locations?: LocationOption[];
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
      expenseAccounts={expenseAccounts}
      locations={locations ?? []}
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
  expenseAccounts,
  locations,
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
  expenseAccounts: ExpenseAccountOption[];
  locations: LocationOption[];
  prefill?: PurchasePrefill | null;
}) {
  const [category, setCategory] = useState<string>(
    prefill?.category ?? "Lainnya",
  );
  const [expenseAccountCode, setExpenseAccountCode] = useState<string>(expenseAccounts[0]?.code ?? "");
  const [ingredientId, setIngredientId] = useState(
    prefill?.category === "Bahan Baku" ? prefill.itemId : ingredients[0]?.id ?? "",
  );
  const [amount, setAmount] = useState(prefill && prefill.amount > 0 ? String(prefill.amount) : "");
  const [paymentMode, setPaymentMode] = useState<"lunas" | "utang" | "sebagian">("lunas");
  const [paidAmount, setPaidAmount] = useState("");
  const [stockOnly, setStockOnly] = useState(false);
  // Qty selalu diketik dalam satuan yang lagi dipilih (satuan stok, atau
  // salah satu varian satuan beli bahan itu) — yang dikirim ke server
  // (hidden input "qty") selalu sudah dikonversi ke satuan stok, biar update
  // stok/HPP tetap konsisten. qtyUnit "" berarti satuan stok langsung.
  const [qtyUnit, setQtyUnit] = useState<string>(prefill?.qtyUnit ?? "");
  const [qtyDisplay, setQtyDisplay] = useState(
    prefill?.category === "Bahan Baku" ? String(prefill.qty) : "",
  );

  const isIngredientPurchase = category === "Bahan Baku";
  const isProductPurchase = category === "Barang Dagang";
  const selectedIngredient = ingredients.find((i) => i.id === ingredientId);
  const purchaseUnits = selectedIngredient?.purchase_units ?? [];
  const selectedVariant = purchaseUnits.find((u) => u.unitName === qtyUnit);
  const qtyNum = Number(qtyDisplay) || 0;
  const baseQty = selectedVariant ? qtyNum * selectedVariant.conversion : qtyNum;

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
            defaultValue={prefill?.supplierId ?? ""}
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

      <div>
        <label htmlFor="category" className="mb-1 block text-xs font-medium text-zinc-600">
          Kategori
        </label>
        <select
          id="category"
          name="category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            if (e.target.value === "Lainnya") setStockOnly(false);
          }}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="Lainnya">Lainnya / Umum (catatan cepat)</option>
          {isFnb && <option value="Bahan Baku">Bahan Baku (update stok otomatis)</option>}
          <option value="Barang Dagang">Barang Dagang (update stok otomatis)</option>
        </select>
      </div>

      {/* Catatan cepat — tanpa detail item */}
      {category === "Lainnya" && (
        <div className="space-y-2 rounded-xl bg-zinc-50 p-3">
          <p className="text-[11px] text-zinc-500">
            Catat nominal invoice tanpa detail per item. Stok tidak diubah otomatis — detail bisa dilengkapi belakangan.
          </p>
          <div>
            <label htmlFor="expenseAccountCode" className="mb-1 block text-xs font-medium text-zinc-600">
              Akun Beban
            </label>
            <select
              id="expenseAccountCode"
              name="expenseAccountCode"
              value={expenseAccountCode}
              onChange={(e) => setExpenseAccountCode(e.target.value)}
              required
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {expenseAccounts.length === 0 && <option value="">Belum ada akun beban</option>}
              {expenseAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Detail bahan baku */}
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
              onChange={(e) => {
                setIngredientId(e.target.value);
                setQtyUnit("");
              }}
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
              <label htmlFor="qtyDisplay" className="mb-1 block text-xs font-medium text-amber-800">
                Qty Dibeli
              </label>
              <input
                id="qtyDisplay"
                type="number"
                min="0"
                step="any"
                placeholder="1000"
                required
                value={qtyDisplay}
                onChange={(e) => setQtyDisplay(e.target.value)}
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-amber-800">Satuan</label>
              {purchaseUnits.length > 0 ? (
                <select
                  value={qtyUnit}
                  onChange={(e) => setQtyUnit(e.target.value)}
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">{selectedIngredient?.unit}</option>
                  {purchaseUnits.map((u) => (
                    <option key={u.unitName} value={u.unitName}>
                      {u.unitName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  readOnly
                  value={selectedIngredient?.unit ?? ""}
                  className="w-full rounded-xl border border-amber-200 bg-amber-100/50 px-3 py-2.5 text-sm text-amber-900"
                />
              )}
            </div>
          </div>
          {selectedVariant && qtyNum > 0 && (
            <p className="text-[10.5px] font-medium text-amber-800">
              = {baseQty.toLocaleString("id-ID")} {selectedIngredient!.unit}
            </p>
          )}
          <input type="hidden" name="qty" value={baseQty || ""} />
          {locations.length > 0 && !prefill?.fromAllocationId && (
            <div>
              <label htmlFor="locationId" className="mb-1 block text-xs font-medium text-amber-800">
                Lokasi Tujuan Stok
              </label>
              <select
                id="locationId"
                name="locationId"
                required
                defaultValue=""
                className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="" disabled>
                  — Pilih lokasi —
                </option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10.5px] text-amber-700/80">
                Stok bahan ini akan bertambah di lokasi yang dipilih, bukan otomatis Gudang Utama.
              </p>
            </div>
          )}
          {prefill?.fromAllocationId && (
            <p className="text-[10.5px] text-amber-700/80">
              Lokasi tujuan mengikuti Permintaan Barang asal pembelian ini.
            </p>
          )}
          <p className="text-[10.5px] text-amber-700/80">
            Stok bahan ini otomatis bertambah, harga/satuan disesuaikan (rata-rata tertimbang).
          </p>
        </div>
      )}

      {/* Detail barang dagang */}
      {isProductPurchase && (
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

      {category !== "Lainnya" && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-200 px-3 py-2.5">
          <input
            type="checkbox"
            name="stockOnly"
            checked={stockOnly}
            onChange={(e) => setStockOnly(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs text-zinc-600">
            <span className="font-medium text-zinc-800">📦 Cuma update stok</span> — kas sudah
            dicatat di tempat lain (mis. sudah disetujui/dibayar lewat Kas Kecil). Entri ini tidak
            akan menyentuh Kas & Bank atau Utang Dagang sama sekali.
          </span>
        </label>
      )}

      {stockOnly ? (
        <p className="rounded-xl bg-zinc-50 px-3 py-2.5 text-[11px] text-zinc-500">
          Status bayar & jatuh tempo tidak berlaku — entri ini murni update stok+harga rata-rata.
        </p>
      ) : (
        <>
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
          </div>

          {paymentMode !== "lunas" && (
            <div>
              <label htmlFor="dueDate" className="mb-1 block text-xs font-medium text-zinc-600">
                Jatuh Tempo (opsional)
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          )}
        </>
      )}
      <input type="hidden" name="paidAmount" value={effectivePaidAmount} />

      <div>
        <label htmlFor="note" className="mb-1 block text-xs font-medium text-zinc-600">
          Catatan (opsional)
        </label>
        <input
          id="note"
          name="note"
          type="text"
          defaultValue={prefill?.note ?? ""}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {prefill?.fromAllocationId && (
        <input type="hidden" name="fromAllocationId" value={prefill.fromAllocationId} />
      )}

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
