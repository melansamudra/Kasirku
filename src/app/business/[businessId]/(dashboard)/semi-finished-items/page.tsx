import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { computeAllSemiFinishedItemCosts } from "@/lib/cost-control/compute-cost";
import { addSemiFinishedItem, importSemiFinishedManual, updateSemiFinishedItemOpnameSections } from "./actions";
import ImportManualForm from "./import-manual-form";
import ItemForm from "./item-form";
import SemiFinishedItemsList, { type SemiFinishedItemRow } from "./item-search-list";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";

// Fungsi biasa (bukan komponen) -- panggil Date.now() langsung di badan
// komponen dilarang lint react-hooks/purity, tapi lewat helper terpisah
// begini aman (sama pola dengan todayWibDateString() di lib/wib.ts).
function nowMs() {
  return Date.now();
}

export default async function SemiFinishedItemsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !hasStockLocationAccess(business)) {
    notFound();
  }

  const [{ data: items }, ingredients, { data: opnameSections }, { data: itemSectionRows }] = await Promise.all([
    supabase
      .from("semi_finished_items")
      .select("id, name, unit, min_stock, category, ingredient_id, updated_at")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    fetchAllRows((from, to) =>
      supabase
        .from("ingredients")
        .select("id, name, unit")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .range(from, to),
    ),
    supabase.from("ingredient_opname_sections").select("id, name").eq("business_id", businessId).order("name", { ascending: true }),
    supabase.from("semi_finished_item_opname_section_items").select("semi_finished_item_id, section_id").eq("business_id", businessId),
  ]);

  const sectionIdsByItem = new Map<string, string[]>();
  for (const row of itemSectionRows ?? []) {
    const list = sectionIdsByItem.get(row.semi_finished_item_id) ?? [];
    list.push(row.section_id);
    sectionIdsByItem.set(row.semi_finished_item_id, list);
  }

  // Stok "asli" BSJ = stok kembarannya di Bahan Baku (lihat migration
  // 20260903010000) -- itu yang benar-benar dipotong checkout & ditambah
  // lewat fitur Produksi, bukan kolom semi_finished_items.stock (lama).
  const mirrorIngredientIds = (items ?? []).map((i) => i.ingredient_id).filter((id): id is string => !!id);
  const { data: mirrorStockRows } = mirrorIngredientIds.length
    ? await supabase.from("ingredients").select("id, stock").in("id", mirrorIngredientIds)
    : { data: [] as { id: string; stock: number }[] };
  const mirrorStockById = new Map((mirrorStockRows ?? []).map((r) => [r.id, Number(r.stock)]));

  const costs = await computeAllSemiFinishedItemCosts(supabase, businessId);
  const boundAddItem = addSemiFinishedItem.bind(null, businessId);
  const boundImportManual = importSemiFinishedManual.bind(null, businessId);

  const rows: SemiFinishedItemRow[] = (items ?? []).map((item) => {
    const cost = costs.get(item.id);
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      stock: item.ingredient_id ? (mirrorStockById.get(item.ingredient_id) ?? 0) : 0,
      minStock: item.min_stock,
      category: item.category,
      updatedAt: item.updated_at,
      unitCost: cost?.unitCost ?? 0,
      rawCost: cost?.rawCost ?? 0,
      fluctuationPct: cost?.fluctuationPct ?? 0,
      breakdown: cost?.breakdown ?? [],
      sectionIds: sectionIdsByItem.get(item.id) ?? [],
    };
  });

  return (
    <div className="w-full max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Bahan Setengah Jadi — {business.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Resep (BOM) bahan setengah jadi yang dibuat tim produksi. HPP dihitung otomatis dari
            bahan baku &amp; bahan setengah jadi lain yang dipakai — atur resepnya di halaman detail
            tiap item.
          </p>
        </div>
        <Link
          href={`/business/${businessId}/semi-finished-items/import`}
          className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"
        >
          Import dari Data Excel
        </Link>
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Impor Cepat (Nama + Harga + Bagian)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Buat banyak BSJ sekaligus dengan HPP manual (bukan resep) sambil langsung ditandai
          Bagian-nya — cocok untuk BSJ yang dibeli/diterima dari luar (mis. dari Dapur Produksi)
          dengan harga sudah termasuk markup. Bagian yang belum ada otomatis dibuatkan.{" "}
          <a href="/template-bsj-manual" download className="font-medium text-brand-600 hover:underline">
            Download template Excel
          </a>
        </p>
        <div className="mt-4">
          <ImportManualForm action={boundImportManual} />
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Bahan Setengah Jadi</h2>
        <ItemForm
          action={boundAddItem}
          submitLabel="+ Tambah Bahan Setengah Jadi"
          recipeBuilder={{
            ingredients: ingredients ?? [],
            semiFinishedOptions: (items ?? []).map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
          }}
        />
      </div>

      <div className="mt-6">
        <SemiFinishedItemsList
          businessId={businessId}
          items={rows}
          now={nowMs()}
          sections={opnameSections ?? []}
          updateSectionsAction={updateSemiFinishedItemOpnameSections.bind(null, businessId)}
        />
      </div>
    </div>
  );
}
