import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordProductionRun } from "./actions";
import NewProductionForm from "./new-production-form";
import ProductionRunCard from "./production-run-card";

export default async function ProduksiPage({
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

  const [{ data: items }, { data: employees }, { data: runs }] = await Promise.all([
    supabase
      .from("semi_finished_items")
      .select("id, name, unit, stock")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("employees")
      .select("id, name")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("production_runs")
      .select("id, item_name, qty_produced, unit, total_cost, produced_by_name, note, voided, void_reason, produced_at")
      .eq("business_id", businessId)
      .order("produced_at", { ascending: false }),
  ]);

  const boundRecord = recordProductionRun.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Produksi — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Catat setiap batch yang dibuat tim produksi. Bahan baku/setengah jadi yang terpakai otomatis
        berkurang sesuai resep, dan stok hasil produksi otomatis bertambah.
      </p>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Catat Produksi Baru</h2>
        <NewProductionForm action={boundRecord} items={items ?? []} employees={employees ?? []} />
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Riwayat Produksi {runs && runs.length > 0 && <span className="text-zinc-400">({runs.length})</span>}
        </h2>
        <div className="space-y-2">
          {runs && runs.length > 0 ? (
            runs.map((run) => <ProductionRunCard key={run.id} businessId={businessId} run={run} />)
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada riwayat produksi.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
