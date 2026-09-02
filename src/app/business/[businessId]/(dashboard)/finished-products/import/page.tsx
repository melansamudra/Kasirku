import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeAllSemiFinishedItemCosts } from "@/lib/cost-control/compute-cost";
import { saveProdukJadiImport } from "./actions";
import { parseProdukJadiExcel, confirmProdukJadiImport } from "./upload-actions";
import ImportTool, { type ImportGroup } from "./import-tool";
import UploadForm from "./upload-form";

export default async function ImportProdukJadiPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !(business.cost_control_enabled || business.rich_stock_ops_enabled)) {
    notFound();
  }

  const { data: stagingRows } = await supabase
    .from("finished_product_import_staging")
    .select("item_name, batch_yield, component_type, ingredient_id, semi_finished_item_id, qty_per_batch, unit")
    .eq("business_id", businessId);

  const grouped = new Map<string, ImportGroup>();
  for (const r of stagingRows ?? []) {
    if (!grouped.has(r.item_name)) {
      grouped.set(r.item_name, { itemName: r.item_name, batchYield: r.batch_yield, rows: [] });
    }
    const componentId = r.component_type === "ingredient" ? r.ingredient_id : r.semi_finished_item_id;
    if (!componentId) continue;
    grouped.get(r.item_name)!.rows.push({
      componentType: r.component_type as "ingredient" | "semi_finished",
      componentId,
      qtyPerBatch: r.qty_per_batch,
      unit: r.unit,
    });
  }
  const groups = [...grouped.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));

  const ingredientIds = [...new Set((stagingRows ?? []).filter((r) => r.component_type === "ingredient").map((r) => r.ingredient_id!))];
  const semiFinishedIds = new Set((stagingRows ?? []).filter((r) => r.component_type === "semi_finished").map((r) => r.semi_finished_item_id!));

  const [{ data: ingredients }, { data: semiFinishedItems }, { data: existingItems }, semiFinishedCosts] = await Promise.all([
    ingredientIds.length
      ? supabase.from("ingredients").select("id, name, unit_cost").in("id", ingredientIds)
      : Promise.resolve({ data: [] }),
    semiFinishedIds.size ? supabase.from("semi_finished_items").select("id, name").in("id", [...semiFinishedIds]) : Promise.resolve({ data: [] }),
    supabase.from("finished_products").select("id, name").eq("business_id", businessId).is("deleted_at", null),
    computeAllSemiFinishedItemCosts(supabase, businessId),
  ]);

  const priceMap: Record<string, { name: string; unitCost: number; type: "ingredient" | "semi_finished" }> = {};
  for (const ing of ingredients ?? []) {
    priceMap[ing.id] = { name: ing.name, unitCost: ing.unit_cost, type: "ingredient" };
  }
  for (const sf of semiFinishedItems ?? []) {
    priceMap[sf.id] = { name: sf.name, unitCost: semiFinishedCosts.get(sf.id)?.unitCost ?? 0, type: "semi_finished" };
  }

  // Nama menu bisa saja sudah ada duluan di Produk Jadi (dibuat manual buat
  // POS/jualan) SEBELUM proses upload resep ini -- jadi "(sudah ada)" tidak
  // otomatis berarti resepnya sudah diisi lewat alat ini. Yang staf perlu
  // tahu justru: menu mana yang RESEPNYA sudah pernah disimpan (lewat sini
  // atau manual) vs yang resepnya masih kosong -- itu yang dipakai buat
  // pisahkan dropdown di bawah jadi 2 grup.
  const existingIds = (existingItems ?? []).map((i) => i.id);
  const { data: recipeRows } = existingIds.length
    ? await supabase.from("finished_product_recipes").select("finished_product_id").in("finished_product_id", existingIds)
    : { data: [] };
  const idsWithRecipe = new Set((recipeRows ?? []).map((r) => r.finished_product_id));
  const itemStatus: Record<string, "new" | "empty" | "filled"> = {};
  for (const it of existingItems ?? []) {
    itemStatus[it.name] = idsWithRecipe.has(it.id) ? "filled" : "empty";
  }

  const boundSave = saveProdukJadiImport.bind(null, businessId);
  const boundParse = parseProdukJadiExcel.bind(null, businessId);
  const boundConfirm = confirmProdukJadiImport.bind(null, businessId);

  return (
    <div className="w-full max-w-3xl">
      <div>
        <Link
          href={`/business/${businessId}/finished-products`}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          ← Kembali ke Produk Jadi
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">Import Resep dari Data Excel — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload file Excel breakdown resep sesuai template, cek hasil pencocokan bahannya (Bahan
          Baku atau Bahan Setengah Jadi), lalu pilih nama Produk Jadi untuk lihat &amp; simpan
          resepnya ke sistem.
        </p>
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">1. Upload Data Excel</h2>
        <UploadForm parseAction={boundParse} confirmAction={boundConfirm} />
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">2. Pilih Menu &amp; Simpan Resep</h2>
        {groups.length === 0 ? (
          <p className="text-xs text-zinc-400">
            Belum ada data. Upload file Excel dulu di bagian atas.
          </p>
        ) : (
          <ImportTool
            groups={groups}
            componentPrices={priceMap}
            itemStatus={itemStatus}
            action={boundSave}
          />
        )}
      </div>
    </div>
  );
}
