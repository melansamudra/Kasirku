import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeAllSemiFinishedItemCosts } from "@/lib/cost-control/compute-cost";
import { recordProductionRun, regenerateProductionScanSlug, rejectProductionRun, verifyProductionRun } from "./actions";
import NewProductionForm from "./new-production-form";
import ProductionRunCard from "./production-run-card";
import PendingProductionCard from "./pending-production-card";
import ProductionScanLinkSection from "./production-scan-link-section";

export default async function ProduksiPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, production_scan_slug")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const [{ data: items }, { data: employees }, { data: runs }, { data: ingredientsAll }, costMap] =
    await Promise.all([
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
        .select(
          "id, item_name, qty_produced, unit, total_cost, produced_by_name, note, voided, void_reason, status, reject_reason, produced_at",
        )
        .eq("business_id", businessId)
        .order("produced_at", { ascending: false }),
      supabase
        .from("ingredients")
        .select("id, stock")
        .eq("business_id", businessId)
        .is("deleted_at", null),
      computeAllSemiFinishedItemCosts(supabase, businessId),
    ]);

  const pendingRuns = (runs ?? []).filter((r) => r.status === "pending");
  const otherRuns = (runs ?? []).filter((r) => r.status !== "pending");

  // Resep (bahan yang bakal terpakai) per item — dipakai form buat kasih
  // pratinjau "bahan apa & berapa banyak" sebelum submit, biar tim produksi
  // tidak menebak-nebak & bisa lihat lebih dulu kalau stoknya kurang.
  const ingredientStockById = new Map((ingredientsAll ?? []).map((i) => [i.id, Number(i.stock)]));
  const semiStockById = new Map((items ?? []).map((i) => [i.id, Number(i.stock)]));

  const recipesByItem: Record<
    string,
    { name: string; qtyPerUnit: number; unit: string; availableStock: number }[]
  > = {};
  for (const item of items ?? []) {
    const cost = costMap.get(item.id);
    recipesByItem[item.id] = (cost?.breakdown ?? []).map((line) => ({
      name: line.name,
      qtyPerUnit: Number(line.qty),
      unit: line.unit,
      availableStock:
        line.componentType === "ingredient"
          ? (ingredientStockById.get(line.id) ?? 0)
          : (semiStockById.get(line.id) ?? 0),
    }));
  }

  const boundRecord = recordProductionRun.bind(null, businessId);
  const boundVerify = verifyProductionRun.bind(null, businessId);
  const boundReject = rejectProductionRun.bind(null, businessId);
  const boundRegenerateSlug = regenerateProductionScanSlug.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Produksi — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Catat setiap batch yang dibuat tim produksi. Bahan baku/setengah jadi yang terpakai otomatis
        berkurang sesuai resep, dan stok hasil produksi otomatis bertambah.
      </p>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Scan Barcode — Tanpa Kertas</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Bagikan link ini ke tim dapur supaya bisa langsung scan barcode + isi jumlah begitu selesai
          produksi, tanpa perlu login atau catat di kertas dulu. Hasil scan masuk sebagai draft di
          bawah — stok baru berubah setelah Anda <strong>verifikasi</strong>.
        </p>
        <ProductionScanLinkSection initialSlug={business.production_scan_slug ?? ""} regenerateAction={boundRegenerateSlug} />
      </div>

      {pendingRuns.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            Menunggu Verifikasi <span className="text-amber-600">({pendingRuns.length})</span>
          </h2>
          <div className="space-y-2">
            {pendingRuns.map((run) => (
              <PendingProductionCard
                key={run.id}
                run={run}
                verifyAction={boundVerify.bind(null, run.id)}
                rejectAction={boundReject.bind(null, run.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Catat Produksi Baru</h2>
        <NewProductionForm
          action={boundRecord}
          items={items ?? []}
          employees={employees ?? []}
          recipesByItem={recipesByItem}
        />
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Riwayat Produksi {otherRuns.length > 0 && <span className="text-zinc-400">({otherRuns.length})</span>}
        </h2>
        <div className="space-y-2">
          {otherRuns.length > 0 ? (
            otherRuns.map((run) => <ProductionRunCard key={run.id} businessId={businessId} run={run} />)
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
