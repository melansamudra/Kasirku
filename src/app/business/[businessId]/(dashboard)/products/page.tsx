import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addProduct, adjustProductStock, editProduct } from "./actions";
import AddProductForm from "./add-product-form";
import AdjustStockForm from "@/components/adjust-stock-form";
import DeleteProductButton from "./delete-product-button";
import EditProductForm from "./edit-product-form";

export default async function ProductsPage({
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
    .select("id, name, category, price, cost, stock, min_stock, emoji")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const { data: adjustments } = await supabase
    .from("stock_adjustments")
    .select("id, item_name, stock_before, stock_after, diff, reason, created_at")
    .eq("business_id", businessId)
    .not("product_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const boundAddProduct = addProduct.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Produk — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">Daftar produk yang bisa dijual di kasir.</p>

        <div className="mt-6 space-y-2">
          {products && products.length > 0 ? (
            products.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg">
                  {p.emoji || "📦"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
                  <p className="text-xs text-zinc-500">
                    {p.category || "Tanpa kategori"} · Stok {p.stock}
                    {Number(p.min_stock) > 0 && Number(p.stock) <= Number(p.min_stock) && (
                      <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        ⚠️ Stok Rendah
                      </span>
                    )}
                  </p>
                  <Link
                    href={`/business/${businessId}/products/${p.id}/recipe`}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Resep / HPP
                  </Link>
                </div>
                <p className="shrink-0 text-sm font-semibold text-zinc-900">
                  Rp{Number(p.price).toLocaleString("id-ID")}
                </p>
                <EditProductForm
                  name={p.name}
                  category={p.category}
                  price={Number(p.price)}
                  cost={Number(p.cost)}
                  minStock={Number(p.min_stock)}
                  emoji={p.emoji}
                  action={editProduct.bind(null, businessId, p.id)}
                />
                <AdjustStockForm
                  itemName={p.name}
                  currentStock={Number(p.stock)}
                  action={adjustProductStock.bind(null, businessId, p.id)}
                />
                <DeleteProductButton businessId={businessId} productId={p.id} productName={p.name} />
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada produk. Tambahkan minimal satu supaya bisa mulai jualan.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Produk</h2>
          <AddProductForm action={boundAddProduct} />
        </div>

        {adjustments && adjustments.length > 0 && (
          <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
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
                      {a.diff}
                    </p>
                  </div>
                  <p className="text-zinc-500">
                    {a.stock_before} → {a.stock_after} · {a.reason} ·{" "}
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
