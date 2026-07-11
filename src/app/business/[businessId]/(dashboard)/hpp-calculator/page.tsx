import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HppCalculator from "./hpp-calculator";

export default async function HppCalculatorPage({
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

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, cost")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const productIds = (products ?? []).map((p) => p.id);

  let recipeRows: {
    product_id: string;
    qty: number;
    unit: string;
    ingredients: { name: string; unit_cost: number } | null;
  }[] = [];

  if (productIds.length > 0) {
    const { data } = await supabase
      .from("product_recipes")
      .select("product_id, qty, unit, ingredients(name, unit_cost)")
      .in("product_id", productIds);
    recipeRows = (data ?? []) as unknown as typeof recipeRows;
  }

  const recipesByProduct = new Map<
    string,
    { name: string; qty: number; unit: string; unitCost: number; lineCost: number }[]
  >();
  for (const r of recipeRows) {
    const list = recipesByProduct.get(r.product_id) ?? [];
    const unitCost = Number(r.ingredients?.unit_cost ?? 0);
    list.push({
      name: r.ingredients?.name ?? "Bahan terhapus",
      qty: Number(r.qty),
      unit: r.unit,
      unitCost,
      lineCost: unitCost * Number(r.qty),
    });
    recipesByProduct.set(r.product_id, list);
  }

  const menuItems = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    cost: Number(p.cost),
    ingredients: recipesByProduct.get(p.id) ?? [],
  }));

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Kalkulator HPP — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Pilih menu untuk melihat total HPP dari seluruh bahan di resepnya, lengkap dengan
        simulasi harga jual & margin.
      </p>

      <HppCalculator menuItems={menuItems} />
    </div>
  );
}
