import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";
import { saveProductRecipeImport } from "./actions";
import { parseProductRecipeExcel, confirmProductRecipeImport } from "./upload-actions";
import ImportTool, { type ImportGroup } from "./import-tool";
import UploadForm from "./upload-form";

export default async function ImportProductRecipePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, stock_locations_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !hasStockLocationAccess(business)) {
    notFound();
  }

  const { data: stagingRows } = await supabase
    .from("product_import_staging")
    .select("item_name, batch_yield, ingredient_id, qty_per_batch, unit")
    .eq("business_id", businessId);

  const grouped = new Map<string, ImportGroup>();
  for (const r of stagingRows ?? []) {
    if (!grouped.has(r.item_name)) {
      grouped.set(r.item_name, { itemName: r.item_name, batchYield: r.batch_yield, rows: [] });
    }
    grouped.get(r.item_name)!.rows.push({
      ingredientId: r.ingredient_id,
      qtyPerBatch: r.qty_per_batch,
      unit: r.unit,
    });
  }
  const groups = [...grouped.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));

  const ingredientIds = [...new Set((stagingRows ?? []).map((r) => r.ingredient_id))];
  const { data: ingredients } = ingredientIds.length
    ? await supabase.from("ingredients").select("id, name, unit_cost").in("id", ingredientIds)
    : { data: [] };

  const priceMap: Record<string, { name: string; unitCost: number }> = {};
  for (const ing of ingredients ?? []) {
    priceMap[ing.id] = { name: ing.name, unitCost: ing.unit_cost };
  }

  // Menu di file Excel dicocokkan ke produk yang SUDAH ADA by nama (products
  // WAJIB punya harga jual, jadi tidak auto-dibuat di sini) -- 3 status:
  // "missing" (belum ada produknya sama sekali), "empty" (produk ada, resep
  // masih kosong), "filled" (resep sudah ada, akan ditimpa kalau disimpan lagi).
  const itemNames = groups.map((g) => g.itemName);
  const { data: existingProducts } = itemNames.length
    ? await supabase.from("products").select("id, name").eq("business_id", businessId).in("name", itemNames).is("deleted_at", null)
    : { data: [] };
  const productIdByName = new Map((existingProducts ?? []).map((p) => [p.name, p.id]));
  const existingIds = [...productIdByName.values()];
  const { data: recipeRows } = existingIds.length
    ? await supabase.from("product_recipes").select("product_id").in("product_id", existingIds)
    : { data: [] };
  const idsWithRecipe = new Set((recipeRows ?? []).map((r) => r.product_id));

  const itemStatus: Record<string, "missing" | "empty" | "filled"> = {};
  for (const name of itemNames) {
    const productId = productIdByName.get(name);
    itemStatus[name] = !productId ? "missing" : idsWithRecipe.has(productId) ? "filled" : "empty";
  }

  const boundSave = saveProductRecipeImport.bind(null, businessId);
  const boundParse = parseProductRecipeExcel.bind(null, businessId);
  const boundConfirm = confirmProductRecipeImport.bind(null, businessId);

  return (
    <div className="w-full max-w-3xl">
      <div>
        <Link href={`/business/${businessId}/products`} className="text-xs font-medium text-brand-600 hover:underline">
          ← Kembali ke Kelola Produk
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">Import Resep Produk dari Data Excel — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload file Excel breakdown resep sesuai template, cek hasil pencocokan bahannya, lalu pilih nama
          produk untuk lihat &amp; simpan resepnya. Produknya harus sudah ada duluan di Kelola Produk (nama
          harus sama persis, karena butuh harga jual yang tidak ada di file Excel).
        </p>
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">1. Upload Data Excel</h2>
        <UploadForm parseAction={boundParse} confirmAction={boundConfirm} />
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">2. Pilih Menu &amp; Simpan Resep</h2>
        {groups.length === 0 ? (
          <p className="text-xs text-zinc-400">Belum ada data. Upload file Excel dulu di bagian atas.</p>
        ) : (
          <ImportTool groups={groups} ingredientPrices={priceMap} itemStatus={itemStatus} action={boundSave} />
        )}
      </div>
    </div>
  );
}
