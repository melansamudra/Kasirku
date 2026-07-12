"use client";

import { useRef, useState } from "react";
import AddPurchaseForm, { type PurchasePrefill } from "./add-purchase-form";
import type { AddPurchaseState } from "./actions";

type SupplierOption = { id: string; name: string };
type IngredientOption = { id: string; name: string; unit: string; stock: number };
type ProductOption = { id: string; name: string; stock: number };

type LowStockIngredient = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  suggestedQty: number;
  unitCost: number;
};

type LowStockProduct = {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  suggestedQty: number;
  unitCost: number;
};

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function PurchaseFormWithRecommendations({
  action,
  today,
  isFnb,
  suppliers,
  ingredients,
  products,
  lowStockIngredients,
  lowStockProducts,
}: {
  action: (state: AddPurchaseState, formData: FormData) => Promise<AddPurchaseState>;
  today: string;
  isFnb: boolean;
  suppliers: SupplierOption[];
  ingredients: IngredientOption[];
  products: ProductOption[];
  lowStockIngredients: LowStockIngredient[];
  lowStockProducts: LowStockProduct[];
}) {
  const [prefill, setPrefill] = useState<PurchasePrefill | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const hasRecommendations = lowStockIngredients.length > 0 || lowStockProducts.length > 0;

  function selectRecommendation(next: PurchasePrefill) {
    setPrefill(next);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      {hasRecommendations && (
        <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">
            📋 Rekomendasi Pembelian (Stok Rendah)
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Saran qty menutup stok kembali ke 2x stok minimum — tetap bisa diubah di form.
          </p>
          <div className="mt-3 space-y-2">
            {lowStockIngredients.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-amber-900">{i.name}</p>
                  <p className="text-[11px] text-amber-700">
                    Stok {i.stock} {i.unit} (min {i.minStock}) · Saran beli {i.suggestedQty}{" "}
                    {i.unit}
                    {i.unitCost > 0 && ` · ~${formatRupiah(i.suggestedQty * i.unitCost)}`}
                  </p>
                </div>
                <button
                  onClick={() =>
                    selectRecommendation({
                      category: "Bahan Baku",
                      itemId: i.id,
                      qty: i.suggestedQty,
                      amount: Math.round(i.suggestedQty * i.unitCost),
                    })
                  }
                  className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  Beli Sekarang
                </button>
              </div>
            ))}
            {lowStockProducts.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-blue-900">{p.name}</p>
                  <p className="text-[11px] text-blue-700">
                    Stok {p.stock} (min {p.minStock}) · Saran beli {p.suggestedQty}
                    {p.unitCost > 0 && ` · ~${formatRupiah(p.suggestedQty * p.unitCost)}`}
                  </p>
                </div>
                <button
                  onClick={() =>
                    selectRecommendation({
                      category: "Barang Dagang",
                      itemId: p.id,
                      qty: p.suggestedQty,
                      amount: Math.round(p.suggestedQty * p.unitCost),
                    })
                  }
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Beli Sekarang
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={formRef} className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Catat Pembelian</h2>
        <AddPurchaseForm
          action={action}
          today={today}
          isFnb={isFnb}
          suppliers={suppliers}
          ingredients={ingredients}
          products={products}
          prefill={prefill}
        />
      </div>
    </>
  );
}
