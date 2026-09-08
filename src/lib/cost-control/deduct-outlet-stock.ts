import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Penjualan produk jadi di resto/bar memakai bahan setengah jadi yang sudah
// dikirim ke outlet itu (lihat outlet_stock) -- jadi mengurangi saldo
// outlet_stock sesuai resep (finished_product_recipes, baris component_type
// "semi_finished" saja -- baris "ingredient" tidak pernah potong stok lewat
// jalur ini) x qty terjual. Dipakai dari form "Catat Penjualan" manual dan
// dari impor rekap ESB (lihat masing-masing pemanggilnya untuk konteks).
// Best-effort & tidak membatalkan penjualan yang sudah tersimpan kalau stok
// outlet ternyata kurang (di-floor ke 0, sama pola dengan void purchase) --
// pencatatan transaksi tetap jadi prioritas, koreksi stok bisa disesuaikan
// manual lewat halaman Outlet kalau perlu.
export async function deductOutletStockForSale(
  supabase: SupabaseServerClient,
  businessId: string,
  outletId: string,
  items: { productId: string; qty: number }[],
) {
  const productIds = items.map((i) => i.productId);
  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .in("id", productIds);
  const nameByProductId = new Map((products ?? []).map((p) => [p.id, p.name]));

  const { data: finishedProducts } = await supabase
    .from("finished_products")
    .select("id, name")
    .eq("business_id", businessId);
  // Nama produk kasir (mis. "Asem Asem Daging") dan nama resep HPP di
  // finished_products (mis. "ASEM ASEM DAGING") sering beda kapitalisasi --
  // cocokkan case-insensitive, bukan exact match, biar potong stok BSJ
  // beneran jalan (bukan diam-diam gagal karena huruf besar/kecil beda).
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const finishedIdByName = new Map((finishedProducts ?? []).map((f) => [norm(f.name), f.id]));

  const finishedIds = items
    .map((i) => finishedIdByName.get(norm(nameByProductId.get(i.productId) ?? "")))
    .filter((id): id is string => !!id);
  if (finishedIds.length === 0) return;

  const { data: recipeRows } = await supabase
    .from("finished_product_recipes")
    .select("finished_product_id, semi_finished_item_id, qty")
    .eq("business_id", businessId)
    .eq("component_type", "semi_finished")
    .in("finished_product_id", finishedIds);

  const neededBySemiId = new Map<string, number>();
  for (const item of items) {
    const productName = nameByProductId.get(item.productId);
    const finishedId = productName ? finishedIdByName.get(norm(productName)) : undefined;
    if (!finishedId) continue;
    for (const recipe of recipeRows ?? []) {
      if (recipe.finished_product_id !== finishedId || !recipe.semi_finished_item_id) continue;
      const need = Number(recipe.qty) * item.qty;
      neededBySemiId.set(
        recipe.semi_finished_item_id,
        (neededBySemiId.get(recipe.semi_finished_item_id) ?? 0) + need,
      );
    }
  }

  for (const [semiFinishedItemId, needed] of neededBySemiId) {
    const { data: stockRow } = await supabase
      .from("outlet_stock")
      .select("id, stock")
      .eq("outlet_id", outletId)
      .eq("semi_finished_item_id", semiFinishedItemId)
      .maybeSingle();
    if (!stockRow) continue;
    await supabase
      .from("outlet_stock")
      .update({ stock: Math.max(0, Number(stockRow.stock) - needed) })
      .eq("id", stockRow.id);
  }
}
