import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeSemiFinishedItemCost, type CostBreakdownLine } from "@/lib/cost-control/compute-cost";
import { addRecipeComponent, removeRecipeComponent, updateSemiFinishedItem } from "../actions";
import ItemForm from "../item-form";
import RecipeEditor from "../recipe-editor";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

function BreakdownRow({ line, depth }: { line: CostBreakdownLine; depth: number }) {
  return (
    <>
      <tr>
        <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 16}px` }}>
          {line.name}
          {line.componentType === "semi_finished" && (
            <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
              setengah jadi
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {formatQty(line.qty)} {line.unit}
        </td>
        <td className="px-3 py-2 text-right">{formatRupiah(line.subtotal)}</td>
      </tr>
      {line.children?.map((child, i) => (
        <BreakdownRow key={i} line={child} depth={depth + 1} />
      ))}
    </>
  );
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
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("id, name, unit, stock, min_stock")
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!item) {
    notFound();
  }

  const [{ data: recipeRows }, { data: ingredients }, { data: otherItems }] = await Promise.all([
    supabase
      .from("semi_finished_recipes")
      .select("id, component_type, ingredient_id, component_semi_finished_id, qty, unit")
      .eq("business_id", businessId)
      .eq("semi_finished_item_id", id),
    supabase
      .from("ingredients")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("semi_finished_items")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .neq("id", id)
      .order("name", { ascending: true }),
  ]);

  const ingredientMap = new Map((ingredients ?? []).map((i) => [i.id, i]));
  const itemMap = new Map((otherItems ?? []).map((i) => [i.id, i]));

  const cost = await computeSemiFinishedItemCost(supabase, businessId, id);

  const boundUpdate = updateSemiFinishedItem.bind(null, businessId, id);
  const boundAddComponent = addRecipeComponent.bind(null, businessId, id);

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
        Stok saat ini {formatQty(item.stock)} {item.unit} · HPP live{" "}
        <span className="font-semibold text-zinc-700">
          {formatRupiah(cost.unitCost)}/{item.unit}
        </span>
      </p>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Resep (per 1 {item.unit} hasil)</h2>
        <p className="mb-3 text-xs text-zinc-400">
          Jumlah komponen di bawah dihitung PER 1 {item.unit} {item.name} yang dihasilkan — saat
          produksi, jumlah ini otomatis dikalikan dengan berapa banyak yang diproduksi.
        </p>

        {cost.breakdown.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Komponen</th>
                  <th className="px-3 py-2 text-right">Jumlah</th>
                  <th className="px-3 py-2 text-right">Biaya</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cost.breakdown.map((line, i) => (
                  <BreakdownRow key={i} line={line} depth={0} />
                ))}
              </tbody>
              <tfoot className="bg-zinc-50">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-zinc-600">
                    Total HPP per {item.unit}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-zinc-900">
                    {formatRupiah(cost.unitCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada komponen resep — HPP masih Rp0.
          </p>
        )}

        {(recipeRows ?? []).length > 0 && (
          <div className="mt-4 space-y-1.5">
            {(recipeRows ?? []).map((line) => {
              const name =
                line.component_type === "ingredient"
                  ? ingredientMap.get(line.ingredient_id ?? "")?.name
                  : itemMap.get(line.component_semi_finished_id ?? "")?.name;
              return (
                <div
                  key={line.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600"
                >
                  <span>
                    {name ?? "(dihapus)"} — {formatQty(line.qty)} {line.unit}
                  </span>
                  <form action={removeRecipeComponent.bind(null, businessId, id, line.id)}>
                    <button type="submit" className="text-zinc-400 hover:text-red-500" title="Hapus komponen">
                      Hapus
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 border-t border-zinc-100 pt-4">
          <RecipeEditor
            action={boundAddComponent}
            ingredients={ingredients ?? []}
            semiFinishedOptions={otherItems ?? []}
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Ubah Data</h2>
        <ItemForm
          action={boundUpdate}
          defaultValues={{ name: item.name, unit: item.unit, minStock: item.min_stock }}
          submitLabel="Simpan Perubahan"
          resetOnSuccess={false}
        />
      </div>
    </div>
  );
}
