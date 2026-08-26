import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PicSelect from "@/components/pic-select";
import { addWarehouse, updateWarehousePic } from "./actions";
import WarehouseForm from "./warehouse-form";

export default async function WarehousesPage({
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
  const boundAddWarehouse = addWarehouse.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Gudang — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Tiap gudang punya penanggung jawab (PIC) dan daftar stoknya sendiri.
      </p>

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
