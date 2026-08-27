import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeAllSemiFinishedItemCosts } from "@/lib/cost-control/compute-cost";
import { addSemiFinishedItem } from "./actions";
import ItemForm from "./item-form";
import SemiFinishedItemsList, { type SemiFinishedItemRow } from "./item-search-list";

export default async function SemiFinishedItemsPage({
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

  const { data: items } = await supabase
    .from("semi_finished_items")
    .select("id, name, unit, stock, min_stock")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const costs = await computeAllSemiFinishedItemCosts(supabase, businessId);
  const boundAddItem = addSemiFinishedItem.bind(null, businessId);

  const rows: SemiFinishedItemRow[] = (items ?? []).map((item) => {
    const cost = costs.get(item.id);
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      stock: item.stock,
      minStock: item.min_stock,
      unitCost: cost?.unitCost ?? 0,
      rawCost: cost?.rawCost ?? 0,
      fluctuationPct: cost?.fluctuationPct ?? 0,
      breakdown: cost?.breakdown ?? [],
    };
  });

  return (
    <div className="w-full max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Bahan Setengah Jadi — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Resep (BOM) bahan setengah jadi yang dibuat tim produksi. HPP dihitung otomatis dari
          bahan baku &amp; bahan setengah jadi lain yang dipakai — atur resepnya di halaman detail
          tiap item.
        </p>
      </div>

      <div className="mt-6">
        <SemiFinishedItemsList businessId={businessId} items={rows} />
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Bahan Setengah Jadi</h2>
        <ItemForm action={boundAddItem} submitLabel="+ Tambah Bahan Setengah Jadi" />
      </div>
    </div>
  );
}
