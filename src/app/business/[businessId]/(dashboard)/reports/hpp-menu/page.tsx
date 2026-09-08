import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import HppMenuListClient from "./hpp-menu-list-client";
import ShareLinkButton from "./share-link-button";

export default async function ReportsHppMenuPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("id, hpp_menu_slug").eq("id", businessId).maybeSingle();
  if (!biz) notFound();

  // Katalog produk aktif -- bukan berbasis transaksi/periode seperti laporan
  // lain, jadi semua produk tampil walau belum pernah terjual.
  const products = await fetchAllRows<{
    id: string;
    name: string;
    category: string | null;
    department: string | null;
    price: number;
    cost: number;
    hpp_checked: boolean;
    updated_at: string;
  }>((from, to) =>
    supabase
      .from("products")
      .select("id, name, category, department, price, cost, hpp_checked, updated_at")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .range(from, to),
  );

  const rows = products.map((p) => {
    const price = Number(p.price);
    const cost = Number(p.cost);
    const margin = price - cost;
    const pct = price > 0 ? (cost / price) * 100 : 0;
    return {
      id: p.id,
      name: p.name,
      category: p.category || "Tanpa Kategori",
      department: p.department,
      price,
      cost,
      margin,
      pct,
      hppChecked: p.hpp_checked,
      updatedAt: p.updated_at,
    };
  });

  const productIds = products.map((p) => p.id);

  // Resep tiap produk -- dimuat sekaligus di sini supaya bisa diedit langsung
  // dari halaman ini (expand per baris), tanpa pindah ke halaman resep.
  const recipeRows = productIds.length
    ? await fetchAllRows<{
        id: string;
        product_id: string;
        qty: number;
        unit: string;
        ingredients: { id: string; name: string; unit_cost: number } | null;
      }>((from, to) =>
        supabase
          .from("product_recipes")
          .select("id, product_id, qty, unit, ingredients(id, name, unit_cost)")
          .in("product_id", productIds)
          .order("id", { ascending: true })
          .range(from, to),
      )
    : [];

  const recipesByProduct: Record<
    string,
    { id: string; qty: number; unit: string; ingredientId: string; name: string; unitCost: number }[]
  > = {};
  for (const r of recipeRows) {
    const ing = r.ingredients as unknown as { id: string; name: string; unit_cost: number } | null;
    if (!ing) continue;
    (recipesByProduct[r.product_id] ??= []).push({
      id: r.id,
      qty: Number(r.qty),
      unit: r.unit,
      ingredientId: ing.id,
      name: ing.name,
      unitCost: Number(ing.unit_cost),
    });
  }

  const ingredients = await fetchAllRows<{ id: string; name: string; unit: string }>((from, to) =>
    supabase
      .from("ingredients")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .range(from, to),
  );

  return (
    <div className="w-full max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Daftar HPP Menu</h1>
          <p className="mt-1 text-sm text-zinc-500">
            HPP seluruh menu (bukan berdasarkan periode transaksi) — {rows.length} menu.
          </p>
        </div>
        <ShareLinkButton businessId={businessId} slug={biz.hpp_menu_slug} />
      </div>

      <HppMenuListClient
        businessId={businessId}
        rows={rows}
        recipesByProduct={recipesByProduct}
        ingredients={ingredients}
      />
    </div>
  );
}
