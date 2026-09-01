import { createClient } from "@/lib/supabase/server";
import { addSemiFinishedProduct, editSemiFinishedProductPrice } from "./semi-finished-product-actions";
import AddSemiFinishedProductForm from "./add-semi-finished-product-form";
import EditSemiFinishedProductPriceForm from "./edit-semi-finished-product-price-form";
import DeleteProductButton from "./delete-product-button";

// Halaman "Kelola Produk" khusus bisnis cost-control (sell_products_enabled)
// -- setiap produk di sini 1:1 dengan satu Bahan Setengah Jadi, jadi jauh
// lebih sederhana dari halaman produk fnb/retail biasa: tanpa kategori,
// varian, barcode, atau resep manual. Stok yang ditampilkan diambil LIVE
// dari semi_finished_item_location_stock (lokasi produksi bisnis ini),
// bukan products.stock -- itu memang tidak dipakai untuk produk jenis ini,
// checkout_transaction juga mengurangi stok di sana, bukan di products.stock
// (lihat migrasi 20260901100000).
export default async function CostControlProductsPage({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const supabase = await createClient();

  const [{ data: products }, { data: semiFinishedItems }, { data: productionLocation }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, price, semi_finished_item_id")
        .eq("business_id", businessId)
        .not("semi_finished_item_id", "is", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("semi_finished_items")
        .select("id, name, unit")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("stock_locations")
        .select("id")
        .eq("business_id", businessId)
        .eq("is_production", true)
        .limit(1)
        .maybeSingle(),
    ]);

  const linkedItemIds = new Set((products ?? []).map((p) => p.semi_finished_item_id));
  const availableItems = (semiFinishedItems ?? []).filter((i) => !linkedItemIds.has(i.id));

  let stockByItemId = new Map<string, number>();
  if (productionLocation) {
    const { data: stockRows } = await supabase
      .from("semi_finished_item_location_stock")
      .select("semi_finished_item_id, stock")
      .eq("location_id", productionLocation.id);
    stockByItemId = new Map((stockRows ?? []).map((r) => [r.semi_finished_item_id, Number(r.stock)]));
  }

  const boundAdd = addSemiFinishedProduct.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Kelola Produk — {businessName}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Produk yang dijual di kasir, satu-satu terhubung ke Bahan Setengah Jadi. Stoknya sama
        dengan stok Bahan Setengah Jadi di lokasi produksi — terjual di sini otomatis
        mengurangi stok itu.
      </p>

      {!productionLocation && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Belum ada lokasi bertanda &ldquo;lokasi produksi&rdquo; untuk bisnis ini — produk bisa dibuat, tapi
          belum bisa terjual di kasir sampai lokasinya diatur.
        </p>
      )}

      <div className="mt-6 space-y-2">
        {products && products.length > 0 ? (
          products.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{p.name}</p>
                <p className="text-xs text-zinc-500">
                  Stok {stockByItemId.get(p.semi_finished_item_id!) ?? 0}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-zinc-900">
                Rp{Number(p.price).toLocaleString("id-ID")}
              </p>
              <EditSemiFinishedProductPriceForm
                price={Number(p.price)}
                action={editSemiFinishedProductPrice.bind(null, businessId, p.id)}
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
        <AddSemiFinishedProductForm action={boundAdd} options={availableItems} />
      </div>
    </div>
  );
}
