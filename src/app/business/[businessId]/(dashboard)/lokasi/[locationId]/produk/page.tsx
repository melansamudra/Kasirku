import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";
import { departmentForLocationName } from "@/lib/product-department";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

const DEPARTMENT_LABELS: Record<string, string> = { dapur: "🍳 Dapur", bar: "🍹 Bar", front: "🛎️ Front" };

export default async function LocationProdukPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !hasStockLocationAccess(business)) {
    notFound();
  }

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) {
    notFound();
  }

  const department = departmentForLocationName(location.name);

  const { data: products } = department
    ? await supabase
        .from("products")
        .select("id, name, category, price, cost, variant_label")
        .eq("business_id", businessId)
        .eq("department", department)
        .is("deleted_at", null)
        .order("category", { ascending: true })
        .order("name", { ascending: true })
    : { data: [] };

  // Rincian bahan per produk -- ditampilkan langsung di halaman ini (expand
  // per menu) supaya tidak perlu pindah ke Kelola Produk cuma buat lihat
  // resepnya.
  const productIds = (products ?? []).map((p) => p.id);
  const recipeRows =
    productIds.length > 0
      ? await fetchAllRows<{
          product_id: string;
          qty: number;
          unit: string;
          ingredient_name_manual: string | null;
          ingredients: { name: string; unit_cost: number } | null;
        }>((from, to) =>
          supabase
            .from("product_recipes")
            .select("product_id, qty, unit, ingredient_name_manual, ingredients(name, unit_cost)")
            .in("product_id", productIds)
            .range(from, to),
        )
      : [];
  const recipesByProduct = new Map<
    string,
    { name: string; qty: number; unit: string; unitCost: number; lineCost: number }[]
  >();
  for (const r of recipeRows) {
    const list = recipesByProduct.get(r.product_id) ?? [];
    const unitCost = Number(r.ingredients?.unit_cost ?? 0);
    list.push({
      name: r.ingredients?.name ?? r.ingredient_name_manual ?? "(bahan dihapus)",
      qty: Number(r.qty),
      unit: r.unit,
      unitCost,
      lineCost: unitCost * Number(r.qty),
    });
    recipesByProduct.set(r.product_id, list);
  }

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">Data Produk — {location.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Produk yang ditandai divisi {department ? DEPARTMENT_LABELS[department] : "—"} di Kelola Produk. Cek &amp;
        edit HPP (resep) masing-masing produk di sini.
      </p>

      <div className="mt-4">
        <Link
          href={`/business/${businessId}/products/import`}
          className="inline-block rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
        >
          📤 Import Resep dari Excel
        </Link>
      </div>

      {!department ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
          Lokasi ini tidak terhubung ke divisi produk tertentu.
        </p>
      ) : (products ?? []).length > 0 ? (
        <div className="mt-6 space-y-2">
          {(products ?? []).map((p) => {
            const price = Number(p.price);
            const cost = Number(p.cost);
            const margin = price - cost;
            const marginPct = price > 0 ? (margin / price) * 100 : 0;
            const ingredients = recipesByProduct.get(p.id) ?? [];
            return (
            <details key={p.id} className="group rounded-xl border border-zinc-200 bg-white">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 select-none">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="shrink-0 text-zinc-300 transition-transform group-open:rotate-90">▶</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {p.name}
                      {p.variant_label ? ` (${p.variant_label})` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {p.category || "Tanpa kategori"}
                      {ingredients.length > 0 ? ` · ${ingredients.length} bahan` : " · belum ada resep"}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-zinc-900">{formatRupiah(price)}</p>
                  <p className="text-[11px] text-zinc-400">HPP {formatRupiah(cost)}</p>
                  <p className={`text-[11px] font-medium ${margin >= 0 ? "text-brand-600" : "text-red-600"}`}>
                    Margin {formatRupiah(margin)} ({marginPct.toFixed(1)}%)
                  </p>
                </div>
              </summary>

              <div className="border-t border-zinc-100 px-4 pb-3 pt-2">
                {ingredients.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-zinc-400">
                        <tr>
                          <th className="py-1 text-left font-medium">Bahan</th>
                          <th className="py-1 text-right font-medium">Jumlah</th>
                          <th className="py-1 text-right font-medium">Harga Satuan</th>
                          <th className="py-1 text-right font-medium">Biaya</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {ingredients.map((ing, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 text-zinc-700">{ing.name}</td>
                            <td className="py-1.5 text-right text-zinc-500">
                              {Number(ing.qty.toFixed(4)).toLocaleString("id-ID")} {ing.unit}
                            </td>
                            <td className="py-1.5 text-right text-zinc-500">{formatRupiah(ing.unitCost)}</td>
                            <td className="py-1.5 text-right font-medium text-zinc-800">{formatRupiah(ing.lineCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-2 text-xs text-zinc-400">Belum ada resep untuk produk ini.</p>
                )}
                <Link
                  href={`/business/${businessId}/products/${p.id}/recipe`}
                  className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline"
                >
                  Edit Resep / HPP →
                </Link>
              </div>
            </details>
            );
          })}
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
          Belum ada produk yang ditandai divisi ini — tandai dulu di halaman Kelola Produk.
        </p>
      )}
    </div>
  );
}
