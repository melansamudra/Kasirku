import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

const normIngredientName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Kembaran BSJ di Bahan Baku (dipakai resep PRODUK/checkout untuk bisnis
// non-cost-control, lihat komentar di addSemiFinishedItem) dulu SELALU
// insert baris ingredients baru tanpa cek dulu apakah nama itu sudah ada --
// begitu nama BSJ kebetulan sama/beda dikit (kapital/spasi) dari bahan baku
// yang sudah ada (mis. dari Stock Opname), yang lama jadi berpasangan
// dengan kembaran baru unit_cost=0 (duplikat). Laporan user 2026-09-05:
// 44 dari 48 grup bahan baku duplikat Llauk ternyata dari sini (3 lokasi
// insert berbeda punya bug yang sama). Reuse ingredient yang sudah ada
// (by nama, dinormalisasi) sebelum bikin baru.
export async function findOrCreateMirrorIngredient(
  supabase: SupabaseClient<Database>,
  businessId: string,
  name: string,
  unit: string,
  unitCost: number,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("ingredients")
    .select("id, name")
    .eq("business_id", businessId)
    .is("deleted_at", null);
  const match = (existing ?? []).find((i) => normIngredientName(i.name) === normIngredientName(name));
  if (match) return match.id;

  const { data: created } = await supabase
    .from("ingredients")
    .insert({ business_id: businessId, name, unit, unit_cost: unitCost, stock: 0, min_stock: 0 })
    .select("id")
    .single();
  return created?.id ?? null;
}
