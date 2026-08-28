import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeAllFinishedProductCosts } from "@/lib/cost-control/compute-cost";
import { addFinishedProduct } from "./actions";
import ProductForm from "./product-form";
import DeleteProductButton from "./delete-product-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default async function FinishedProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: products } = await supabase
    .from("finished_products")
    .select("id, name, category, selling_price, target_food_cost_pct")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const costs = await computeAllFinishedProductCosts(supabase, businessId);
  const boundAddProduct = addFinishedProduct.bind(null, businessId);

  return (
    <div className="w-full max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Produk Jadi (HPP) — {business.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Untuk kontrol biaya &amp; margin saja — produk ini <b>tidak dijual lewat POS Kasirku</b>.
            HPP dihitung otomatis dari resep (bahan setengah jadi + bahan baku).
          </p>
        </div>
        <Link
          href={`/business/${businessId}/finished-products/import`}
          className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"
        >
          Import dari Data Excel
        </Link>
      </div>

      <div className="mt-6 space-y-2">
        {products && products.length > 0 ? (
          products.map((product) => {
            const hpp = costs.get(product.id)?.unitCost ?? 0;
            const suggestedPrice =
              product.target_food_cost_pct != null && product.target_food_cost_pct > 0
                ? hpp / (product.target_food_cost_pct / 100)
                : null;
            const effectivePrice = product.selling_price ?? suggestedPrice;
            const margin = effectivePrice != null ? effectivePrice - hpp : null;
            const marginPct =
              margin != null && effectivePrice ? Math.round((margin / effectivePrice) * 100) : null;
            return (
              <div
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/business/${businessId}/finished-products/${product.id}`}
                    className="text-sm font-medium text-zinc-900 hover:text-brand-600 hover:underline"
                  >
                    {product.name}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {product.category || "Tanpa kategori"} · HPP {formatRupiah(hpp)}
                    {product.selling_price != null
                      ? ` · Jual ${formatRupiah(product.selling_price)}`
                      : suggestedPrice != null
                        ? ` · Jual ~${formatRupiah(suggestedPrice)} (saran)`
                        : ""}
                  </p>
                </div>
                {effectivePrice == null ? (
                  <p className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                    Belum ada harga jual
                  </p>
                ) : (
                  marginPct != null && (
                    <p
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        marginPct >= 30
                          ? "bg-emerald-50 text-emerald-700"
                          : marginPct >= 15
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                      }`}
                    >
                      Margin {marginPct}%
                    </p>
                  )
                )}
                <DeleteProductButton businessId={businessId} productId={product.id} productName={product.name} />
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada produk jadi. Tambahkan dulu, lalu atur resepnya di halaman detail.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Produk Jadi</h2>
        <ProductForm action={boundAddProduct} submitLabel="+ Tambah Produk Jadi" />
      </div>
    </div>
  );
}
