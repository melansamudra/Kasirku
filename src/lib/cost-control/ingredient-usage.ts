import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Cari nama produk jadi/BSJ yang masih pakai bahan-bahan ini di resepnya --
// dipakai buat blokir hapus (satu-satu maupun massal) dan buat badge "Dipakai
// di" di halaman Bahan Baku. `deleteIngredient` sebelumnya TIDAK punya
// pengecekan ini sama sekali (beda dari deleteSemiFinishedItem yang sudah
// ada), jadi bahan bisa terhapus walau masih dipakai resep -- resep jadi
// diam-diam rusak (ingredient_id mengarah ke baris yang sudah soft-deleted).
// Ambil id polos dulu lalu gabung nama di JS (bukan embedded join PostgREST)
// -- semi_finished_recipes punya DUA foreign key ke semi_finished_items,
// embedded join tanpa hint nama constraint FK jadi ambigu.
export async function findIngredientUsage(
  supabase: SupabaseServerClient,
  businessId: string,
  ingredientIds: string[],
): Promise<Map<string, string[]>> {
  const usage = new Map<string, string[]>();
  if (ingredientIds.length === 0) return usage;

  const [{ data: inFinished }, { data: inSemi }] = await Promise.all([
    supabase
      .from("finished_product_recipes")
      .select("ingredient_id, finished_products(name)")
      .eq("business_id", businessId)
      .in("ingredient_id", ingredientIds),
    supabase
      .from("semi_finished_recipes")
      .select("ingredient_id, semi_finished_item_id")
      .eq("business_id", businessId)
      .in("ingredient_id", ingredientIds),
  ]);

  const parentSemiIds = [...new Set((inSemi ?? []).map((r) => r.semi_finished_item_id))];
  const { data: parentSemiItems } = parentSemiIds.length
    ? await supabase.from("semi_finished_items").select("id, name").in("id", parentSemiIds)
    : { data: [] as { id: string; name: string }[] };
  const parentSemiNameById = new Map((parentSemiItems ?? []).map((s) => [s.id, s.name]));

  for (const row of inFinished ?? []) {
    const name = (row.finished_products as unknown as { name: string } | null)?.name;
    if (!row.ingredient_id || !name) continue;
    const list = usage.get(row.ingredient_id) ?? [];
    list.push(name);
    usage.set(row.ingredient_id, list);
  }
  for (const row of inSemi ?? []) {
    const name = parentSemiNameById.get(row.semi_finished_item_id);
    if (!row.ingredient_id || !name) continue;
    const list = usage.get(row.ingredient_id) ?? [];
    list.push(name);
    usage.set(row.ingredient_id, list);
  }
  return usage;
}
