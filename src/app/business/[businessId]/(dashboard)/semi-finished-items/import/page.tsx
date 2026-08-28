import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saveBsjImport } from "./actions";
import ImportTool, { type ImportGroup } from "./import-tool";
import importRows from "@/lib/cost-control/data/bsj-import-dataglobal.json";

type ImportRow = {
  itemName: string;
  ingredientId: string;
  ingredientNameRaw: string;
  qtyPerBatch: number;
  unit: string;
  batchYield: number;
};

export default async function ImportBsjPage({ params }: { params: Promise<{ businessId: string }> }) {
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

  const rows = importRows as ImportRow[];
  const grouped = new Map<string, ImportGroup>();
  for (const r of rows) {
    if (!grouped.has(r.itemName)) {
      grouped.set(r.itemName, { itemName: r.itemName, batchYield: r.batchYield, rows: [] });
    }
    grouped.get(r.itemName)!.rows.push({
      ingredientId: r.ingredientId,
      ingredientName: r.ingredientNameRaw,
      qtyPerBatch: r.qtyPerBatch,
      unit: r.unit,
    });
  }
  const groups = [...grouped.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));

  const ingredientIds = [...new Set(rows.map((r) => r.ingredientId))];
  const [{ data: ingredients }, { data: existingItems }] = await Promise.all([
    supabase.from("ingredients").select("id, name, unit_cost").in("id", ingredientIds),
    supabase.from("semi_finished_items").select("name").eq("business_id", businessId).is("deleted_at", null),
  ]);

  const priceMap: Record<string, { name: string; unitCost: number }> = {};
  for (const ing of ingredients ?? []) {
    priceMap[ing.id] = { name: ing.name, unitCost: ing.unit_cost };
  }
  const existingNames = new Set((existingItems ?? []).map((i) => i.name));

  const boundSave = saveBsjImport.bind(null, businessId);

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
          Pilih nama Bahan Setengah Jadi, bahan-bahannya otomatis muncul dari data breakdown Excel
          (dataglobal). Cek dulu angkanya, lalu klik Simpan untuk membuat/menimpa resepnya di sistem.
        </p>
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <ImportTool
          groups={groups}
          ingredientPrices={priceMap}
          existingNames={[...existingNames]}
          action={boundSave}
        />
      </div>
    </div>
  );
}
