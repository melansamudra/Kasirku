import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Cari nama produk jadi/BSJ lain yang masih pakai BSJ-BSJ ini sebagai
// komponen resepnya -- dipakai buat blokir hapus (satu-satu maupun massal)
// dan buat badge "Dipakai di" di halaman Bahan Setengah Jadi. Pola sama
// dengan findIngredientUsage (ingredient-usage.ts). Ambil id polos dulu lalu
// gabung nama di JS (bukan embedded join PostgREST) -- semi_finished_recipes
// punya DUA foreign key ke semi_finished_items (semi_finished_item_id &
// component_semi_finished_id), jadi embedded join butuh nama constraint FK
// yang gampang salah tebak; compute-cost.ts juga pakai pola id-lalu-map ini.
export async function findSemiFinishedItemUsage(
  supabase: SupabaseServerClient,
  businessId: string,
  semiFinishedItemIds: string[],
): Promise<Map<string, string[]>> {
  const usage = new Map<string, string[]>();
  if (semiFinishedItemIds.length === 0) return usage;

  const [{ data: inFinished }, { data: inSemi }] = await Promise.all([
    supabase
      .from("finished_product_recipes")
      .select("finished_product_id, semi_finished_item_id")
      .eq("business_id", businessId)
      .in("semi_finished_item_id", semiFinishedItemIds),
    supabase
      .from("semi_finished_recipes")
      .select("semi_finished_item_id, component_semi_finished_id")
      .eq("business_id", businessId)
      .in("component_semi_finished_id", semiFinishedItemIds),
  ]);

  const finishedProductIds = [...new Set((inFinished ?? []).map((r) => r.finished_product_id))];
  const parentSemiIds = [...new Set((inSemi ?? []).map((r) => r.semi_finished_item_id))];

  const [{ data: finishedProducts }, { data: parentSemiItems }] = await Promise.all([
    finishedProductIds.length
      ? supabase.from("finished_products").select("id, name").in("id", finishedProductIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    parentSemiIds.length
      ? supabase.from("semi_finished_items").select("id, name").in("id", parentSemiIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const finishedProductNameById = new Map((finishedProducts ?? []).map((p) => [p.id, p.name]));
  const parentSemiNameById = new Map((parentSemiItems ?? []).map((s) => [s.id, s.name]));

  for (const row of inFinished ?? []) {
    const name = finishedProductNameById.get(row.finished_product_id);
    if (!row.semi_finished_item_id || !name) continue;
    const list = usage.get(row.semi_finished_item_id) ?? [];
    list.push(name);
    usage.set(row.semi_finished_item_id, list);
  }
  for (const row of inSemi ?? []) {
    const name = parentSemiNameById.get(row.semi_finished_item_id);
    if (!row.component_semi_finished_id || !name) continue;
    const list = usage.get(row.component_semi_finished_id) ?? [];
    list.push(name);
    usage.set(row.component_semi_finished_id, list);
  }
  return usage;
}
