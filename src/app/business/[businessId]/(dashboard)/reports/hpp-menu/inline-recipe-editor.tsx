"use client";

import { useRouter } from "next/navigation";
import EditQtyCell from "@/app/business/[businessId]/(dashboard)/products/[productId]/recipe/edit-qty-cell";
import RemoveRecipeButton from "@/app/business/[businessId]/(dashboard)/products/[productId]/recipe/remove-recipe-button";
import AddRecipeForm from "@/app/business/[businessId]/(dashboard)/products/[productId]/recipe/add-recipe-form";
import { addRecipeItems, type BatchRecipeItemInput } from "@/app/business/[businessId]/(dashboard)/products/[productId]/recipe/actions";

type RecipeLine = { id: string; qty: number; unit: string; ingredientId: string; name: string; unitCost: number };
type Ingredient = { id: string; name: string; unit: string };

function fmt(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

// Editor resep yang dipakai langsung di baris (expanded) halaman Laporan
// HPP Menu -- reuse komponen dari halaman /products/[productId]/recipe
// supaya tidak duplikat logika, tapi tambahkan router.refresh() lewat
// onSaved/onRemoved biar angka HPP/Margin di baris ini ikut ter-update
// tanpa pindah halaman (revalidatePath bawaan cuma menyasar path resep).
export default function InlineRecipeEditor({
  businessId,
  productId,
  items,
  ingredients,
}: {
  businessId: string;
  productId: string;
  items: RecipeLine[];
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const totalHpp = items.reduce((s, it) => s + it.qty * it.unitCost, 0);

  const boundAdd = (batch: BatchRecipeItemInput[]) => addRecipeItems(businessId, productId, batch);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      {items.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-[10px] text-zinc-500">
              <tr>
                <th className="px-2 py-1.5 text-left">Bahan</th>
                <th className="px-2 py-1.5 text-right">Jumlah</th>
                <th className="px-2 py-1.5 text-right">Harga Satuan</th>
                <th className="px-2 py-1.5 text-right">Biaya</th>
                <th className="w-6 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-2 py-1.5 text-zinc-800">{it.name}</td>
                  <td className="px-2 py-1.5 text-right">
                    <EditQtyCell
                      businessId={businessId}
                      productId={productId}
                      recipeItemId={it.id}
                      qty={it.qty}
                      unit={it.unit}
                      onSaved={() => router.refresh()}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right text-zinc-500">{fmt(it.unitCost)}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-zinc-800">{fmt(it.qty * it.unitCost)}</td>
                  <td className="px-1 py-1.5 text-right">
                    <RemoveRecipeButton
                      businessId={businessId}
                      productId={productId}
                      recipeItemId={it.id}
                      onRemoved={() => router.refresh()}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-50">
              <tr>
                <td colSpan={3} className="px-2 py-1.5 text-right text-[10px] font-semibold text-zinc-600">
                  Total HPP
                </td>
                <td className="px-2 py-1.5 text-right text-xs font-bold text-zinc-900">{fmt(totalHpp)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-center text-[11px] text-zinc-400">
          Belum ada resep untuk menu ini.
        </p>
      )}

      <div className="mt-3">
        <AddRecipeForm action={boundAdd} ingredients={ingredients} onSaved={() => router.refresh()} />
      </div>
    </div>
  );
}
