import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addProduct,
  addProductCategory,
  addVariants,
  adjustProductStock,
  editProduct,
  importProducts,
  updateProductDepartment,
} from "./actions";
import AddProductForm from "./add-product-form";
import AddVariantForm from "./add-variant-form";
import AdjustStockForm from "@/components/adjust-stock-form";
import CategoryManager from "./category-manager";
import DeleteProductButton from "./delete-product-button";
import EditProductForm from "./edit-product-form";
import FeaturedToggle from "./featured-toggle";
import ImportProductsForm from "./import-products-form";
import CostControlProductsPage from "./cost-control-products-page";
import ProductDepartmentSelect from "./department-select";

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, rich_stock_ops_enabled, sell_products_enabled")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  // Bisnis cost-control pakai halaman "Kelola Produk" yang jauh lebih
  // sederhana (produk 1:1 ke Bahan Setengah Jadi) -- lihat cost-control-
  // products-page.tsx. Kalau cost-control tapi belum diaktifkan jualannya,
  // halaman ini memang belum boleh diakses sama sekali. rich_stock_ops_enabled
  // (Llauk pasca-konversi) ikut kelakuan cost-control di sini juga.
  if (business.cost_control_enabled || business.rich_stock_ops_enabled) {
    if (!business.sell_products_enabled) notFound();
    return <CostControlProductsPage businessId={businessId} businessName={business.name} />;
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, category, price, cost, stock, min_stock, emoji, barcode, sku, variant_label, image_url, featured, department")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  // Group by name (variants share the same name), then by category
  const groups: { name: string; rows: NonNullable<typeof products> }[] = [];
  for (const p of products ?? []) {
    const existing = groups.find((g) => g.name === p.name);
    if (existing) {
      existing.rows.push(p);
    } else {
      groups.push({ name: p.name, rows: [p] });
    }
  }

  // Group name-groups by category for the folder/accordion view
  const categoryMap = new Map<string, typeof groups>();
  for (const g of groups) {
    const cat = g.rows[0].category || "Tanpa Kategori";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(g);
  }
  // Sort: defined categories alphabetically, "Tanpa Kategori" last
  const categoryEntries = [...categoryMap.entries()].sort(([a], [b]) => {
    if (a === "Tanpa Kategori") return 1;
    if (b === "Tanpa Kategori") return -1;
    return a.localeCompare(b, "id");
  });

  const { data: adjustments } = await supabase
    .from("stock_adjustments")
    .select("id, item_name, stock_before, stock_after, diff, reason, created_at")
    .eq("business_id", businessId)
    .not("product_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: categoryRows } = await supabase
    .from("product_categories")
    .select("id, name")
    .eq("business_id", businessId)
    .order("name", { ascending: true });
  const categories = categoryRows ?? [];
  const categoryNames = categories.map((c) => c.name);

  const boundAddProduct = addProduct.bind(null, businessId);
  const boundAddProductCategory = addProductCategory.bind(null, businessId);
  const boundImportProducts = importProducts.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Produk — {business.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">Daftar produk yang bisa dijual di kasir.</p>
          </div>
          <a
            href={`/business/${businessId}/products/export`}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            ⬇️ Ekspor Excel
          </a>
        </div>

        <div className="mt-6">
          <CategoryManager
            businessId={businessId}
            categories={categories}
            action={boundAddProductCategory}
          />
        </div>

        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Impor dari Excel / CSV</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Format kolom sama dengan hasil Ekspor Excel. Produk dengan Barcode/SKU yang sudah ada
            akan diperbarui, sisanya ditambahkan sebagai produk baru.{" "}
            <a
              href="/template-produk"
              download
              className="font-medium text-brand-600 hover:underline"
            >
              Download template Excel
            </a>
          </p>
          <div className="mt-4">
            <ImportProductsForm action={boundImportProducts} />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {categoryEntries.length > 0 ? (
            categoryEntries.map(([cat, catGroups], catIdx) => {
              const totalProducts = catGroups.reduce((s, g) => s + g.rows.length, 0);
              return (
                <details key={cat} open={catIdx === 0} className="group rounded-xl border border-zinc-200 bg-white">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-base transition-transform group-open:rotate-90">
                      ▶
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900">{cat}</p>
                      <p className="text-xs text-zinc-500">{totalProducts} produk</p>
                    </div>
                  </summary>
                  <div className="space-y-2 border-t border-zinc-100 px-4 pb-4 pt-3">
                    {catGroups.map((g) =>
                      g.rows.length === 1 ? (
                        <div key={g.rows[0].id} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                          <ProductRow
                            businessId={businessId}
                            p={g.rows[0]}
                            showName
                            categories={categoryNames}
                          />
                          <AddVariantForm
                            action={addVariants.bind(null, businessId, g.rows[0].name, g.rows[0].category, g.rows[0].emoji)}
                          />
                        </div>
                      ) : (
                        <div key={g.name} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg">
                              {g.rows[0].emoji || "📦"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-zinc-900">{g.name}</p>
                              <p className="text-xs text-zinc-500">{g.rows.length} varian</p>
                            </div>
                          </div>
                          <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2">
                            {g.rows.map((p) => (
                              <ProductRow
                                key={p.id}
                                businessId={businessId}
                                p={p}
                                showName={false}
                                categories={categoryNames}
                              />
                            ))}
                            <AddVariantForm
                              action={addVariants.bind(null, businessId, g.name, g.rows[0].category, g.rows[0].emoji)}
                            />
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </details>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada produk. Tambahkan minimal satu supaya bisa mulai jualan.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Produk</h2>
          <AddProductForm action={boundAddProduct} categories={categoryNames} businessId={businessId} />
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
  image_url: string | null;
  featured: boolean | null;
  department: string | null;
};

function ProductRow({
  businessId,
  p,
  showName,
  categories,
}: {
  businessId: string;
  p: ProductRowData;
  showName: boolean;
  categories: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
      {showName && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg overflow-hidden">
          {p.image_url ? (
            <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
          ) : (
            p.emoji || "📦"
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-medium text-zinc-900">
            {showName ? p.name : p.variant_label || "Varian"}
          </p>
          {showName && (
            <ProductDepartmentSelect productId={p.id} department={p.department} action={updateProductDepartment.bind(null, businessId)} />
          )}
        </div>
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
        <div className="flex gap-3">
          <Link
            href={`/business/${businessId}/products/${p.id}/recipe`}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            Resep / HPP
          </Link>
          <Link
            href={`/business/${businessId}/products/${p.id}/options`}
            className="text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline"
          >
            Opsi/Modifier
          </Link>
        </div>
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
        imageUrl={p.image_url}
        categories={categories}
        businessId={businessId}
        action={editProduct.bind(null, businessId, p.id)}
      />
      <AdjustStockForm
        itemName={p.variant_label ? `${p.name} (${p.variant_label})` : p.name}
        currentStock={Number(p.stock)}
        action={adjustProductStock.bind(null, businessId, p.id)}
      />
      <FeaturedToggle businessId={businessId} productId={p.id} featured={!!p.featured} />
      <DeleteProductButton businessId={businessId} productId={p.id} productName={p.name} />
    </div>
  );
}
