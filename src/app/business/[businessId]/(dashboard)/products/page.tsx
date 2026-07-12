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
    .select("id, name, category, price, cost, stock, min_stock, emoji, barcode, sku, variant_label")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  // Variants are just extra product rows sharing the same name — group them
  // here purely for display, no schema relationship involved.
  const groups: { name: string; rows: NonNullable<typeof products> }[] = [];
  for (const p of products ?? []) {
    const existing = groups.find((g) => g.name === p.name);
    if (existing) {
      existing.rows.push(p);
    } else {
      groups.push({ name: p.name, rows: [p] });
    }
  }

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
          {groups.length > 0 ? (
            groups.map((g) =>
              g.rows.length === 1 ? (
                <ProductRow
                  key={g.rows[0].id}
                  businessId={businessId}
                  p={g.rows[0]}
                  showName
                />
              ) : (
                <div
                  key={g.name}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg">
                      {g.rows[0].emoji || "📦"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{g.name}</p>
                      <p className="text-xs text-zinc-500">
                        {g.rows[0].category || "Tanpa kategori"} · {g.rows.length} varian
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2">
                    {g.rows.map((p) => (
                      <ProductRow key={p.id} businessId={businessId} p={p} showName={false} />
                    ))}
                  </div>
                </div>
              ),
            )
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

type ProductRowData = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  emoji: string | null;
  barcode: string | null;
  sku: string | null;
  variant_label: string | null;
};

function ProductRow({
  businessId,
  p,
  showName,
}: {
  businessId: string;
  p: ProductRowData;
  showName: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
      {showName && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg">
          {p.emoji || "📦"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">
          {showName ? p.name : p.variant_label || "Varian"}
        </p>
        <p className="text-xs text-zinc-500">
          {showName && `${p.category || "Tanpa kategori"} · `}Stok {p.stock}
          {Number(p.min_stock) > 0 && Number(p.stock) <= Number(p.min_stock) && (
            <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
              ⚠️ Stok Rendah
            </span>
          )}
        </p>
        {(p.barcode || p.sku) && (
          <p className="text-[11px] text-zinc-400">
            {p.barcode && <>🔖 {p.barcode}</>}
            {p.barcode && p.sku && " · "}
            {p.sku && <>SKU {p.sku}</>}
          </p>
        )}
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
        barcode={p.barcode}
        sku={p.sku}
        variantLabel={p.variant_label}
        action={editProduct.bind(null, businessId, p.id)}
      />
      <AdjustStockForm
        itemName={p.variant_label ? `${p.name} (${p.variant_label})` : p.name}
        currentStock={Number(p.stock)}
        action={adjustProductStock.bind(null, businessId, p.id)}
      />
      <DeleteProductButton businessId={businessId} productId={p.id} productName={p.name} />
    </div>
  );
}
