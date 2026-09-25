import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { computeAllFinishedProductCosts, computeAllSemiFinishedItemCosts } from "@/lib/cost-control/compute-cost";
import HppMenuListClient from "./hpp-menu-list-client";
import CostControlHppMenuList, { type CostControlHppRow } from "./cost-control-hpp-menu-list";
import ShareLinkButton from "./share-link-button";

export default async function ReportsHppMenuPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("id, hpp_menu_slug, cost_control_enabled")
    .eq("id", businessId)
    .maybeSingle();
  if (!biz) notFound();

  // Bisnis cost-control tidak punya katalog products/product_recipes yang
  // dipakai jualan (lihat cost-control-products-page.tsx) -- data HPP-nya
  // ada di finished_products (Produk Jadi) & semi_finished_items (BSJ),
  // jadi rekap-nya digabung dari dua tabel itu, bukan dari `products`.
  if (biz.cost_control_enabled) {
    const [{ data: finishedProducts }, { data: semiItems }, finishedCosts, semiCosts] = await Promise.all([
      supabase
        .from("finished_products")
        .select("id, name, category, selling_price, updated_at")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("semi_finished_items")
        .select("id, name, unit, category, hpp_checked, batch_yield_qty, updated_at")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      computeAllFinishedProductCosts(supabase, businessId),
      computeAllSemiFinishedItemCosts(supabase, businessId),
    ]);

    const rows: CostControlHppRow[] = [
      ...(finishedProducts ?? []).map((p): CostControlHppRow => {
        const cost = finishedCosts.get(p.id)?.unitCost ?? 0;
        const price = p.selling_price != null ? Number(p.selling_price) : null;
        return {
          id: p.id,
          type: "finished",
          name: p.name,
          category: p.category || "Tanpa Kategori",
          unit: null,
          price,
          cost,
          margin: price != null ? price - cost : null,
          pct: price != null && price > 0 ? (cost / price) * 100 : null,
          hppChecked: null,
          updatedAt: p.updated_at,
          detailHref: `/business/${businessId}/finished-products/${p.id}`,
          breakdown: finishedCosts.get(p.id)?.breakdown ?? [],
          batchYieldQty: null,
        };
      }),
      ...(semiItems ?? []).map((s): CostControlHppRow => ({
        id: s.id,
        type: "semi",
        name: s.name,
        category: s.category || "Tanpa Kategori",
        unit: s.unit,
        price: null,
        cost: semiCosts.get(s.id)?.unitCost ?? 0,
        margin: null,
        pct: null,
        hppChecked: s.hpp_checked,
        updatedAt: s.updated_at,
        detailHref: `/business/${businessId}/semi-finished-items/${s.id}`,
        breakdown: semiCosts.get(s.id)?.breakdown ?? [],
        batchYieldQty: s.batch_yield_qty !== null ? Number(s.batch_yield_qty) : null,
      })),
    ].sort((a, b) => a.name.localeCompare(b.name, "id"));

    return (
      <div className="w-full max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Daftar HPP Menu</h1>
            <p className="mt-1 text-sm text-zinc-500">
              HPP seluruh Produk Jadi &amp; Bahan Setengah Jadi — {rows.length} item.
            </p>
          </div>
          <ShareLinkButton businessId={businessId} slug={biz.hpp_menu_slug} />
        </div>

        <CostControlHppMenuList rows={rows} />
      </div>
    );
  }

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
