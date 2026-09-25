import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { computeAllSemiFinishedItemCosts, computeSemiFinishedItemCost } from "@/lib/cost-control/compute-cost";
import { addRecipeComponentsBulk, removeRecipeComponent, updateRecipeYield, updateSemiFinishedItem } from "../actions";
import ItemForm from "../item-form";
import RecipeDropdownMultiAdd from "../recipe-dropdown-multi-add";
import RecipeBulkAdd from "../recipe-bulk-add";
import RecipeYieldForm from "../recipe-yield-form";
import ProduceForm from "../produce-form";
import EditRecipeQtyCell from "../edit-recipe-qty-cell";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

export default async function SemiFinishedItemDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const { businessId, id } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !hasStockLocationAccess(business)) {
    notFound();
  }

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("id, name, unit, min_stock, fluctuation_pct, barcode, category, batch_yield_qty, ingredient_id, manual_unit_cost")
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!item) {
    notFound();
  }

  // Stok "asli" = stok kembarannya di Bahan Baku (lihat migration
  // 20260903010000) -- bukan kolom semi_finished_items.stock (lama).
  const [{ data: mirrorIngredient }, { data: locations }] = await Promise.all([
    item.ingredient_id
      ? supabase.from("ingredients").select("stock").eq("id", item.ingredient_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("stock_locations").select("id, name").eq("business_id", businessId).order("sort_order"),
  ]);
  const currentStock = mirrorIngredient ? Number(mirrorIngredient.stock) : 0;

  const [{ data: recipeRows }, ingredients, { data: otherItems }, semiCosts] = await Promise.all([
    supabase
      .from("semi_finished_recipes")
      .select("id, component_type, ingredient_id, component_semi_finished_id, qty, unit")
      .eq("business_id", businessId)
      .eq("semi_finished_item_id", id),
    fetchAllRows((from, to) =>
      supabase
        .from("ingredients")
        .select("id, name, unit, unit_cost")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .range(from, to),
    ),
    supabase
      .from("semi_finished_items")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .neq("id", id)
      .order("name", { ascending: true }),
    computeAllSemiFinishedItemCosts(supabase, businessId),
  ]);

  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));
  const itemMap = new Map((otherItems ?? []).map((i) => [i.id, i]));

  const cost = await computeSemiFinishedItemCost(supabase, businessId, id);

  const recipeLineRows = (recipeRows ?? []).map((line) => {
    const isIngredient = line.component_type === "ingredient";
    const ing = isIngredient ? ingredientMap.get(line.ingredient_id ?? "") : undefined;
    const semi = !isIngredient ? itemMap.get(line.component_semi_finished_id ?? "") : undefined;
    const componentUnitCost = isIngredient
      ? Number(ing?.unit_cost ?? 0)
      : (semiCosts.get(line.component_semi_finished_id ?? "")?.unitCost ?? 0);
    return {
      id: line.id,
      name: ing?.name ?? semi?.name ?? "(dihapus)",
      isSemiFinished: !isIngredient,
      qty: Number(line.qty),
      unit: line.unit,
      subtotal: Number(line.qty) * componentUnitCost,
    };
  });

  const boundUpdate = updateSemiFinishedItem.bind(null, businessId, id);
  const boundAddComponentsBulk = addRecipeComponentsBulk.bind(null, businessId, id);
  const boundUpdateYield = updateRecipeYield.bind(null, businessId, id);
  const batchYieldQty = item.batch_yield_qty !== null ? Number(item.batch_yield_qty) : null;
  const hasBatchMode = !!batchYieldQty && batchYieldQty > 0 && batchYieldQty !== 1;
  const scale = hasBatchMode ? batchYieldQty! : 1;
  // Item baru & belum ada resep sama sekali -- jangan biarkan nambah bahan
  // sebelum "menghasilkan berapa porsi" diputuskan dulu. Ini akar masalah
  // yang berulang (Kuah Serani, Kuah Rawon): bahan diisi duluan dalam
  // jumlah TOTAL BATCH, baru belakangan yield-nya di-set -- karena tidak ada
  // basis skala saat itu, sistem anggap qty yang sudah ada sudah benar per-1-
  // satuan (lihat updateRecipeYield), padahal aslinya belum dibagi sama sekali.
  const needsYieldDecision = batchYieldQty === null && recipeLineRows.length === 0;

  return (
    <div className="w-full max-w-3xl">
      <Link
        href={`/business/${businessId}/semi-finished-items`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← Kembali ke Bahan Setengah Jadi
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">{item.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Stok saat ini {formatQty(currentStock)} {item.unit} · HPP live{" "}
        <span className="font-semibold text-zinc-700">
          {formatRupiah(cost.unitCost)}/{item.unit}
        </span>
      </p>
      {!business.cost_control_enabled && !business.rich_stock_ops_enabled && (
        <>
          <p className="mt-2 text-xs font-medium text-zinc-600">Produksi</p>
          <ProduceForm businessId={businessId} itemId={id} itemUnit={item.unit} locations={locations ?? []} />
        </>
      )}

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Resep (per 1 {item.unit} hasil)</h2>
        <p className="mb-3 text-xs text-zinc-400">
          Jumlah komponen di bawah dihitung PER 1 {item.unit} {item.name} yang dihasilkan — saat
          produksi, jumlah ini otomatis dikalikan dengan berapa banyak yang diproduksi.
        </p>

        {needsYieldDecision ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">
              Sebelum nambah bahan, tentukan dulu resep ini untuk berapa porsi
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Kalau bahan yang mau dimasukkan itu untuk SATU KALI MASAK BESAR (mis. satu panci buat
              banyak porsi), isi jumlah porsinya di sini dulu — supaya nanti gramasi bahan otomatis
              dibagi ke per-porsi dengan benar. Kalau memang langsung per 1 {item.unit} (tanpa konsep
              batch), klik &quot;Langsung per 1 porsi&quot; saja.
            </p>
            <div className="mt-3">
              <RecipeYieldForm
                action={boundUpdateYield}
                unit={item.unit}
                currentYieldQty={batchYieldQty}
                showSkipButton
              />
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-lg bg-zinc-50 p-3">
            <RecipeYieldForm action={boundUpdateYield} unit={item.unit} currentYieldQty={batchYieldQty} />
            <p className="mt-1.5 text-[11px] text-zinc-400">
              Dipakai buat isi/tampilkan jumlah komponen dalam bentuk &quot;per batch&quot; di bawah, bukan cuma
              per-1-{item.unit}.
            </p>
          </div>
        )}

        {!needsYieldDecision && recipeLineRows.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Komponen</th>
                  <th className="px-3 py-2 text-right">Jumlah</th>
                  <th className="px-3 py-2 text-right">Biaya</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recipeLineRows.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">
                      {line.name}
                      {line.isSemiFinished && (
                        <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
                          setengah jadi
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <EditRecipeQtyCell
                        businessId={businessId}
                        semiFinishedItemId={id}
                        recipeRowId={line.id}
                        qty={line.qty}
                        unit={line.unit}
                        batchYieldQty={batchYieldQty}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{formatRupiah(line.subtotal * scale)}</td>
                    <td className="px-1 py-2 text-right">
                      <form action={removeRecipeComponent.bind(null, businessId, id, line.id)}>
                        <button
                          type="submit"
                          className="text-zinc-400 hover:text-red-500"
                          title="Hapus komponen"
                        >
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-zinc-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs text-zinc-500">
                    Sub total{hasBatchMode ? ` (1 batch = ${batchYieldQty} ${item.unit})` : ""}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-zinc-600">{formatRupiah(cost.rawCost * scale)}</td>
                </tr>
                {cost.fluctuationPct > 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-xs text-zinc-500">
                      Fluctuation ({cost.fluctuationPct}%)
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-zinc-600">
                      {formatRupiah((cost.unitCost - cost.rawCost) * scale)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-zinc-600">
                    Total HPP per {item.unit}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-zinc-900">
                    {formatRupiah(cost.unitCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : !needsYieldDecision ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            {cost.unitCost > 0
              ? `HPP diisi manual: ${formatRupiah(cost.unitCost)}/${item.unit} — tidak dihitung dari resep.`
              : "Belum ada komponen resep — HPP masih Rp0."}
          </p>
        ) : null}

        {!needsYieldDecision && (
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <RecipeDropdownMultiAdd
              action={boundAddComponentsBulk}
              ingredients={ingredients ?? []}
              semiFinishedOptions={otherItems ?? []}
              batchYieldQty={batchYieldQty}
              resultUnit={item.unit}
            />
            <div className="mt-3">
              <RecipeBulkAdd
                action={boundAddComponentsBulk}
                ingredients={ingredients ?? []}
                semiFinishedOptions={otherItems ?? []}
                batchYieldQty={batchYieldQty}
                resultUnit={item.unit}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Ubah Data</h2>
        <ItemForm
          action={boundUpdate}
          defaultValues={{
            name: item.name,
            unit: item.unit,
            minStock: item.min_stock,
            fluctuationPct: item.fluctuation_pct,
            barcode: item.barcode,
            category: item.category,
            manualUnitCost: item.manual_unit_cost !== null ? Number(item.manual_unit_cost) : null,
          }}
          submitLabel="Simpan Perubahan"
          resetOnSuccess={false}
        />
      </div>
    </div>
  );
}
