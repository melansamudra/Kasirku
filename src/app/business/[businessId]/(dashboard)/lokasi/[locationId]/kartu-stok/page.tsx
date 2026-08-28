import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import KartuStokList, { type KartuStokRow } from "./kartu-stok-list";

export default async function LocationKartuStokPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) {
    notFound();
  }

  const [adjustments, { data: ingredientStocks }, { data: semiStocks }, { data: opnameEntries }] = await Promise.all([
    fetchAllRows<{
      ingredient_id: string | null;
      semi_finished_item_id: string | null;
      item_name: string;
      unit: string | null;
      diff: number;
    }>((from, to) =>
      supabase
        .from("stock_adjustments")
        .select("ingredient_id, semi_finished_item_id, item_name, unit, diff")
        .eq("business_id", businessId)
        .eq("location_id", locationId)
        .range(from, to),
    ),
    supabase
      .from("ingredient_location_stock")
      .select("ingredient_id, stock, ingredients(name, unit)")
      .eq("business_id", businessId)
      .eq("location_id", locationId),
    supabase
      .from("semi_finished_item_location_stock")
      .select("semi_finished_item_id, stock, semi_finished_items(name, unit)")
      .eq("business_id", businessId)
      .eq("location_id", locationId),
    supabase
      .from("stock_opname_entries")
      .select("ingredient_id, semi_finished_item_id, reported_stock, status, entry_date")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .order("created_at", { ascending: false }),
  ]);

  const rows = new Map<string, KartuStokRow>();

  function ensureRow(key: string, name: string, unit: string, componentType: "ingredient" | "semi_finished", id: string) {
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        id,
        componentType,
        name,
        unit,
        stokData: 0,
        stockMasuk: 0,
        stockKeluar: 0,
        lastOpname: null,
      });
    }
    return rows.get(key)!;
  }

  for (const s of ingredientStocks ?? []) {
    const ing = s.ingredients as unknown as { name: string; unit: string } | null;
    if (!ing) continue;
    const row = ensureRow(`ing:${s.ingredient_id}`, ing.name, ing.unit, "ingredient", s.ingredient_id);
    row.stokData = Number(s.stock);
  }
  for (const s of semiStocks ?? []) {
    const item = s.semi_finished_items as unknown as { name: string; unit: string } | null;
    if (!item) continue;
    const row = ensureRow(`semi:${s.semi_finished_item_id}`, item.name, item.unit, "semi_finished", s.semi_finished_item_id);
    row.stokData = Number(s.stock);
  }

  for (const a of adjustments) {
    const key = a.ingredient_id ? `ing:${a.ingredient_id}` : `semi:${a.semi_finished_item_id}`;
    const id = a.ingredient_id ?? a.semi_finished_item_id ?? "";
    const componentType = a.ingredient_id ? "ingredient" : "semi_finished";
    const row = ensureRow(key, a.item_name, a.unit ?? "", componentType, id);
    const diff = Number(a.diff);
    if (diff > 0) row.stockMasuk += diff;
    else row.stockKeluar += Math.abs(diff);
  }

  for (const o of opnameEntries ?? []) {
    const key = o.ingredient_id ? `ing:${o.ingredient_id}` : `semi:${o.semi_finished_item_id}`;
    const row = rows.get(key);
    // Baris pertama yang ketemu per key = paling baru (sudah order by
    // created_at desc), sisanya (opname lama) dilewati.
    if (row && !row.lastOpname) {
      row.lastOpname = {
        reportedStock: Number(o.reported_stock),
        status: o.status as "pending" | "verified" | "rejected",
        entryDate: o.entry_date,
      };
    }
  }

  const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="w-full max-w-3xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">Kartu Stok — {location.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Stok Data (sistem), Stok Riil (opname terakhir), Selisih, status Verifikasi, dan total
        Stock Masuk/Keluar sepanjang riwayat lokasi ini — per bahan.
      </p>

      <div className="mt-4">
        <KartuStokList items={list} />
      </div>
    </div>
  );
}
