import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addIngredient, adjustIngredientStock, editIngredient } from "./actions";
import AddIngredientForm from "./add-ingredient-form";
import AdjustStockForm from "@/components/adjust-stock-form";
import DeleteIngredientButton from "./delete-ingredient-button";
import EditIngredientForm from "./edit-ingredient-form";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default async function IngredientsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, unit_cost, stock, min_stock")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const { data: adjustments } = await supabase
    .from("stock_adjustments")
    .select("id, item_name, unit, stock_before, stock_after, diff, reason, created_at")
    .eq("business_id", businessId)
    .not("ingredient_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const boundAddIngredient = addIngredient.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Bahan Baku — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Daftar bahan baku, dipakai untuk hitung HPP resep produk.
        </p>

        <div className="mt-6 space-y-2">
          {ingredients && ingredients.length > 0 ? (
            ingredients.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{i.name}</p>
                  <p className="text-xs text-zinc-500">
                    Stok {i.stock} {i.unit}
                    {Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock) && (
                      <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        ⚠️ Stok Rendah
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-sm font-semibold text-zinc-900">
                  {formatRupiah(Number(i.unit_cost))}/{i.unit}
                </p>
                <EditIngredientForm
                  name={i.name}
                  unit={i.unit}
                  unitCost={Number(i.unit_cost)}
                  minStock={Number(i.min_stock)}
                  action={editIngredient.bind(null, businessId, i.id)}
                />
                <AdjustStockForm
                  itemName={i.name}
                  currentStock={Number(i.stock)}
                  unit={i.unit}
                  action={adjustIngredientStock.bind(null, businessId, i.id)}
                />
                <DeleteIngredientButton
                  businessId={businessId}
                  ingredientId={i.id}
                  ingredientName={i.name}
                />
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada bahan baku. Tambahkan minimal satu supaya bisa dipakai di resep.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Bahan Baku</h2>
          <AddIngredientForm action={boundAddIngredient} />
        </div>

        {adjustments && adjustments.length > 0 && (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">Riwayat Penyesuaian Stok</h2>
            <div className="space-y-2">
              {adjustments.map((a) => (
                <div key={a.id} className="border-b border-zinc-100 pb-2 text-xs last:border-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-zinc-800">{a.item_name}</p>
                    <p
                      className={
                        Number(a.diff) > 0 ? "font-semibold text-brand-600" : "font-semibold text-red-500"
                      }
                    >
                      {Number(a.diff) > 0 ? "+" : ""}
                      {a.diff} {a.unit}
                    </p>
                  </div>
                  <p className="text-zinc-500">
                    {a.stock_before} → {a.stock_after} {a.unit} · {a.reason} ·{" "}
                    {new Date(a.created_at).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
