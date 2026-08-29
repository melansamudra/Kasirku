import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addIngredient,
  addIngredientPurchaseUnit,
  adjustIngredientStock,
  deleteIngredientPurchaseUnit,
  editIngredient,
  importIngredients,
  updateIngredientDepartment,
} from "./actions";
import AddIngredientForm from "./add-ingredient-form";
import AdjustStockForm from "@/components/adjust-stock-form";
import DeleteIngredientButton from "./delete-ingredient-button";
import DepartmentSelect from "./department-select";
import EditIngredientForm from "./edit-ingredient-form";
import GenerateBarcodesButton from "./generate-barcodes-button";
import ImportIngredientsForm from "./import-ingredients-form";
import IngredientSearch from "./ingredient-search";
import PurchaseUnitsManager from "./purchase-units-manager";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default async function IngredientsPage({
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

  if (!business) {
    notFound();
  }

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, unit_cost, stock, min_stock, department, barcode")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const { data: purchaseUnits } = await supabase
    .from("ingredient_purchase_units")
    .select("id, ingredient_id, unit_name, conversion")
    .eq("business_id", businessId)
    .order("unit_name", { ascending: true });

  const purchaseUnitsByIngredient = new Map<
    string,
    { id: string; unitName: string; conversion: number }[]
  >();
  for (const u of purchaseUnits ?? []) {
    const list = purchaseUnitsByIngredient.get(u.ingredient_id) ?? [];
    list.push({ id: u.id, unitName: u.unit_name, conversion: Number(u.conversion) });
    purchaseUnitsByIngredient.set(u.ingredient_id, list);
  }

  // Riwayat penyesuaian stok cuma relevan buat bisnis non-cost-control --
  // Llauk Nusantara dkk kelola stok fisik per lokasi (lihat menu Gudang
  // Utama/Kitchen Atas/dst di sidebar), bukan di sini.
  const { data: adjustments } = business.cost_control_enabled
    ? { data: [] }
    : await supabase
        .from("stock_adjustments")
        .select("id, item_name, unit, stock_before, stock_after, diff, reason, created_at")
        .eq("business_id", businessId)
        .not("ingredient_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(10);

  const boundAddIngredient = addIngredient.bind(null, businessId);
  const boundImportIngredients = importIngredients.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Bahan Baku — {business.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Daftar bahan baku, dipakai untuk hitung HPP resep produk.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <GenerateBarcodesButton businessId={businessId} />
            <a
              href={`/business/${businessId}/ingredients/export`}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              ⬇️ Ekspor Excel
            </a>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Impor dari Excel / CSV</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Format kolom sama dengan hasil Ekspor Excel. Bahan dengan nama yang sudah ada akan
            diperbarui, sisanya ditambahkan sebagai bahan baru.{" "}
            <a
              href="/template-bahan-baku"
              download
              className="font-medium text-brand-600 hover:underline"
            >
              Download template Excel
            </a>
          </p>
          <div className="mt-4">
            <ImportIngredientsForm action={boundImportIngredients} />
          </div>
        </div>

        <div className="mt-6">
          {ingredients && ingredients.length > 0 ? (
            <IngredientSearch names={ingredients.map((i) => i.name)}>
              {ingredients.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-zinc-900">{i.name}</p>
                    <DepartmentSelect
                      ingredientId={i.id}
                      department={i.department}
                      action={updateIngredientDepartment.bind(null, businessId)}
                    />
                  </div>
                  {business.cost_control_enabled ? (
                    <p className="text-xs text-zinc-400">
                      Stok fisik dikelola per lokasi — lihat menu Gudang Utama / Kitchen Llauk / dst
                      di sidebar.
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      Stok {i.stock} {i.unit}
                      {Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock) && (
                        <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                          ⚠️ Stok Rendah
                        </span>
                      )}
                    </p>
                  )}
                  <PurchaseUnitsManager
                    baseUnit={i.unit}
                    units={purchaseUnitsByIngredient.get(i.id) ?? []}
                    addAction={addIngredientPurchaseUnit.bind(null, businessId, i.id)}
                    deleteAction={deleteIngredientPurchaseUnit.bind(null, businessId)}
                  />
                </div>
                <p className="text-sm font-semibold text-zinc-900">
                  {formatRupiah(Number(i.unit_cost))}/{i.unit}
                </p>
                <EditIngredientForm
                  name={i.name}
                  unit={i.unit}
                  unitCost={Number(i.unit_cost)}
                  minStock={Number(i.min_stock)}
                  barcode={i.barcode}
                  action={editIngredient.bind(null, businessId, i.id)}
                />
                {!business.cost_control_enabled && (
                  <AdjustStockForm
                    itemName={i.name}
                    currentStock={Number(i.stock)}
                    unit={i.unit}
                    action={adjustIngredientStock.bind(null, businessId, i.id)}
                  />
                )}
                <DeleteIngredientButton
                  businessId={businessId}
                  ingredientId={i.id}
                  ingredientName={i.name}
                />
              </div>
              ))}
            </IngredientSearch>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada bahan baku. Tambahkan minimal satu supaya bisa dipakai di resep.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Bahan Baku</h2>
          <AddIngredientForm action={boundAddIngredient} costControlEnabled={business.cost_control_enabled ?? false} />
        </div>

        {adjustments && adjustments.length > 0 && (
          <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">Riwayat Penyesuaian Stok</h2>
            <div className="space-y-2">
              {adjustments.map((a) => (
                <div key={a.id} className="border-b border-zinc-100 pb-2 text-xs last:border-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-zinc-800">{a.item_name}</p>
                    <p
                      className={
                        Number(a.diff) > 0 ? "font-semibold text-brand-600" : "font-semibold text-red-500"
                      }
                    >
                      {Number(a.diff) > 0 ? "+" : ""}
                      {a.diff} {a.unit}
                    </p>
                  </div>
                  <p className="text-zinc-500">
                    {a.stock_before} → {a.stock_after} {a.unit} · {a.reason} ·{" "}
                    {new Date(a.created_at).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
