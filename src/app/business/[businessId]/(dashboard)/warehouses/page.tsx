import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PicSelect from "@/components/pic-select";
import { addWarehouse, distributeToWarehouse, regenerateWarehouseRequestSlug, updateWarehousePic } from "./actions";
import WarehouseForm from "./warehouse-form";
import DistributeForm from "./distribute-form";
import WarehouseRequestLinkSection from "./link-section";

export default async function WarehousesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, warehouse_request_slug")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const [{ data: warehouses }, { data: employees }, { data: ingredients }] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, name, kind, pic_employee_id")
      .eq("business_id", businessId)
      .order("name", { ascending: true }),
    supabase
      .from("employees")
      .select("id, name")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("ingredients")
      .select("id, name, unit, stock, warehouse_id")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  const ingredientsByWarehouse = new Map<string, { name: string; unit: string; stock: number }[]>();
  for (const ing of ingredients ?? []) {
    if (!ing.warehouse_id) continue;
    const list = ingredientsByWarehouse.get(ing.warehouse_id) ?? [];
    list.push({ name: ing.name, unit: ing.unit, stock: Number(ing.stock) });
    ingredientsByWarehouse.set(ing.warehouse_id, list);
  }

  const rawWarehouses = (warehouses ?? []).filter((w) => w.kind === "bahan_baku");
  const semiWarehouse = (warehouses ?? []).find((w) => w.kind === "setengah_jadi") ?? null;
  const purchasingWarehouse = (warehouses ?? []).find((w) => w.kind === "purchasing") ?? null;

  const { data: bufferRows } = purchasingWarehouse
    ? await supabase
        .from("warehouse_stock")
        .select("ingredient_id, stock")
        .eq("warehouse_id", purchasingWarehouse.id)
        .gt("stock", 0)
    : { data: [] };

  const ingredientById = new Map((ingredients ?? []).map((i) => [i.id, i]));
  const bufferItems = (bufferRows ?? [])
    .map((row) => {
      const ing = ingredientById.get(row.ingredient_id);
      return ing ? { id: row.ingredient_id, name: ing.name, unit: ing.unit, stock: Number(row.stock) } : null;
    })
    .filter((x): x is { id: string; name: string; unit: string; stock: number } => x !== null);

  const boundAddWarehouse = addWarehouse.bind(null, businessId);
  const boundDistribute = distributeToWarehouse.bind(null, businessId);
  const boundRegenerateSlug = regenerateWarehouseRequestSlug.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Gudang — {business.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Tiap gudang punya penanggung jawab (PIC) dan daftar stoknya sendiri.
          </p>
        </div>
        <Link
          href={`/business/${businessId}/permintaan-gudang`}
          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Lihat Permintaan Gudang →
        </Link>
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Link Permintaan Gudang</h2>
        <WarehouseRequestLinkSection
          initialSlug={business.warehouse_request_slug ?? ""}
          regenerateAction={boundRegenerateSlug}
        />
      </div>

      {purchasingWarehouse && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-900">{purchasingWarehouse.name}</p>
              <p className="text-xs text-amber-700">
                Buffer bahan baku yang sudah dibeli, belum disalurkan ke Gudang Kering/Basah
              </p>
            </div>
            <PicSelect
              id={purchasingWarehouse.id}
              picEmployeeId={purchasingWarehouse.pic_employee_id}
              employees={employees ?? []}
              action={updateWarehousePic.bind(null, businessId)}
            />
          </div>
          <div className="mt-2.5 border-t border-amber-200 pt-2.5">
            {bufferItems.length === 0 ? (
              <p className="text-xs text-amber-700/70">Buffer kosong</p>
            ) : (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {bufferItems.map((i) => (
                  <span
                    key={i.id}
                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800"
                  >
                    {i.name}: {i.stock} {i.unit}
                  </span>
                ))}
              </div>
            )}
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-700">
              Salurkan ke gudang tujuan (Gudang minta barang)
            </p>
            <DistributeForm action={boundDistribute} bufferItems={bufferItems} />
          </div>
        </div>
      )}

      {semiWarehouse && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">{semiWarehouse.name}</p>
              <p className="text-xs text-zinc-500">Stok hasil produksi — kelola di Bahan Setengah Jadi</p>
            </div>
            <PicSelect
              id={semiWarehouse.id}
              picEmployeeId={semiWarehouse.pic_employee_id}
              employees={employees ?? []}
              action={updateWarehousePic.bind(null, businessId)}
            />
          </div>
          <Link
            href={`/business/${businessId}/semi-finished-items`}
            className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline"
          >
            Lihat daftar & stok →
          </Link>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {rawWarehouses.map((w) => {
          const items = ingredientsByWarehouse.get(w.id) ?? [];
          return (
            <div key={w.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-900">{w.name}</p>
                <PicSelect
                  id={w.id}
                  picEmployeeId={w.pic_employee_id}
                  employees={employees ?? []}
                  action={updateWarehousePic.bind(null, businessId)}
                />
              </div>
              <div className="mt-2.5 border-t border-zinc-100 pt-2.5">
                {items.length === 0 ? (
                  <p className="text-xs text-zinc-300">
                    Belum ada bahan baku ditandai ke gudang ini — atur lewat halaman Bahan Baku.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((i) => (
                      <span
                        key={i.name}
                        className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-800"
                      >
                        {i.name}: {i.stock} {i.unit}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Gudang</h2>
        <WarehouseForm action={boundAddWarehouse} submitLabel="+ Tambah Gudang" />
      </div>
    </div>
  );
}
