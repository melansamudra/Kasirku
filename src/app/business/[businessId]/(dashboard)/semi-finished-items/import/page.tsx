import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saveBsjImport } from "./actions";
import { parseDataglobalExcel, confirmDataglobalImport } from "./upload-actions";
import ImportTool, { type ImportGroup } from "./import-tool";
import UploadForm from "./upload-form";

export default async function ImportBsjPage({ params }: { params: Promise<{ businessId: string }> }) {
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
    .from("bsj_import_staging")
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
  const [{ data: ingredients }, { data: existingItems }] = await Promise.all([
    ingredientIds.length
      ? supabase.from("ingredients").select("id, name, unit_cost").in("id", ingredientIds)
      : Promise.resolve({ data: [] }),
    supabase.from("semi_finished_items").select("name").eq("business_id", businessId).is("deleted_at", null),
  ]);

  const priceMap: Record<string, { name: string; unitCost: number }> = {};
  for (const ing of ingredients ?? []) {
    priceMap[ing.id] = { name: ing.name, unitCost: ing.unit_cost };
  }
  const existingNames = new Set((existingItems ?? []).map((i) => i.name));

  const boundSave = saveBsjImport.bind(null, businessId);
  const boundParse = parseDataglobalExcel.bind(null, businessId);
  const boundConfirm = confirmDataglobalImport.bind(null, businessId);

  return (
    <div className="w-full max-w-3xl">
      <div>
        <Link
          href={`/business/${businessId}/semi-finished-items`}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          ← Kembali ke Bahan Setengah Jadi
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">Import Resep dari Data Excel — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload file Excel breakdown resep sesuai template, cek hasil pencocokan bahan bakunya,
          lalu pilih nama Bahan Setengah Jadi untuk lihat &amp; simpan resepnya ke sistem.
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
            ingredientPrices={priceMap}
            existingNames={[...existingNames]}
            action={boundSave}
          />
        )}
      </div>
    </div>
  );
}
