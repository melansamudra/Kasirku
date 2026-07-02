import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addRecipeItem } from "./actions";
import AddRecipeForm from "./add-recipe-form";
import RemoveRecipeButton from "./remove-recipe-button";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default async function ProductRecipePage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, price, cost")
    .eq("id", productId)
    .eq("business_id", businessId)
    .single();

  if (!product) {
    notFound();
  }

  const { data: recipeItems } = await supabase
    .from("product_recipes")
    .select("id, qty, unit, ingredients(id, name, unit_cost)")
    .eq("product_id", productId)
    .order("id", { ascending: true });

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, unit")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const boundAddRecipeItem = addRecipeItem.bind(null, businessId, productId);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link
          href={`/business/${businessId}/products`}
          className="text-xs font-medium text-zinc-500 hover:underline"
        >
          ← Kembali ke produk
        </Link>

        <h1 className="mt-3 text-lg font-bold text-zinc-900">Resep — {product.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Harga jual {formatRupiah(Number(product.price))} · HPP saat ini{" "}
          <span className="font-semibold text-zinc-700">
            {formatRupiah(Number(product.cost))}
          </span>
        </p>

        <div className="mt-6 space-y-2">
          {recipeItems && recipeItems.length > 0 ? (
            recipeItems.map((r) => {
              const ingredient = r.ingredients as unknown as {
                id: string;
                name: string;
                unit_cost: number;
              } | null;
              const lineCost = Number(ingredient?.unit_cost ?? 0) * Number(r.qty);
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {ingredient?.name ?? "—"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {r.qty} {r.unit} · {formatRupiah(lineCost)}
                    </p>
                  </div>
                  <RemoveRecipeButton
                    businessId={businessId}
                    productId={productId}
                    recipeItemId={r.id}
                  />
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada resep. HPP produk ini masih diisi manual (
              {formatRupiah(Number(product.cost))}).
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Bahan ke Resep</h2>
          <AddRecipeForm action={boundAddRecipeItem} ingredients={ingredients ?? []} />
        </div>
      </div>
    </div>
  );
}
