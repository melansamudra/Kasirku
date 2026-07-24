"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CreateBusinessState = { error: string | null };

// Penyalinan sekali di awal, bukan sinkron terus-menerus — setelah ini tiap
// toko punya baris produk/bahan/resep sendiri yang independen. Stok fisik
// (products.stock, ingredients.stock) sengaja di-reset ke 0 di toko baru,
// bukan ikut disalin, karena stok itu milik lokasi fisik masing-masing.
// Chart of accounts toko baru tidak perlu disentuh di sini — sudah otomatis
// ter-seed oleh trigger DB `businesses_seed_accounts` saat insert businesses.
async function copyMenuFromBusiness(
  supabase: SupabaseServerClient,
  targetBusinessId: string,
  sourceBusinessId: string,
) {
  const { data: sourceIngredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, unit_cost, min_stock")
    .eq("business_id", sourceBusinessId)
    .is("deleted_at", null);

  const ingredientIdMap = new Map<string, string>();
  for (const ing of sourceIngredients ?? []) {
    const { data: newIngredient } = await supabase
      .from("ingredients")
      .insert({
        business_id: targetBusinessId,
        name: ing.name,
        unit: ing.unit,
        unit_cost: ing.unit_cost,
        min_stock: ing.min_stock,
        stock: 0,
      })
      .select("id")
      .single();

    if (!newIngredient) continue;
    ingredientIdMap.set(ing.id, newIngredient.id);

    await supabase.from("ingredient_price_history").insert({
      business_id: targetBusinessId,
      ingredient_id: newIngredient.id,
      unit_cost: ing.unit_cost,
      source: "salin",
    });
  }

  const { data: sourceProducts } = await supabase
    .from("products")
    .select("id, name, category, price, cost, barcode, image_url, emoji, min_stock, sku, variant_label")
    .eq("business_id", sourceBusinessId)
    .is("deleted_at", null);

  let productCount = 0;
  for (const p of sourceProducts ?? []) {
    const { data: newProduct } = await supabase
      .from("products")
      .insert({
        business_id: targetBusinessId,
        name: p.name,
        category: p.category,
        price: p.price,
        cost: p.cost,
        stock: 0,
        barcode: p.barcode,
        image_url: p.image_url,
        emoji: p.emoji,
        min_stock: p.min_stock,
        sku: p.sku,
        variant_label: p.variant_label,
      })
      .select("id")
      .single();

    if (!newProduct) continue;
    productCount += 1;

    const { data: recipeLines } = await supabase
      .from("product_recipes")
      .select("ingredient_id, ingredient_name_manual, qty, unit")
      .eq("product_id", p.id);

    for (const line of recipeLines ?? []) {
      await supabase.from("product_recipes").insert({
        product_id: newProduct.id,
        ingredient_id: line.ingredient_id ? (ingredientIdMap.get(line.ingredient_id) ?? null) : null,
        ingredient_name_manual: line.ingredient_name_manual,
        qty: line.qty,
        unit: line.unit,
      });
    }
  }

  await logActivity(
    supabase,
    targetBusinessId,
    "produk",
    "sukses",
    "Menu disalin dari toko lain",
    `${productCount} produk, ${ingredientIdMap.size} bahan baku`,
  );
}

export async function createBusiness(
  _prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const name = (formData.get("name") as string)?.trim();
  const businessType = formData.get("business_type") as string;

  if (!name) {
    return { error: "Nama toko wajib diisi." };
  }
  if (businessType !== "fnb" && businessType !== "retail" && businessType !== "tiket") {
    return { error: "Pilih jenis bisnis dulu." };
  }

  const { data: business, error } = await supabase
    .from("businesses")
    .insert({
      owner_id: user.id,
      name,
      business_type: businessType,
    })
    .select("id")
    .single();

  if (error || !business) {
    return { error: error?.message ?? "Gagal membuat bisnis." };
  }

  // Belum ada trial — pemilik baru harus pilih & bayar paket dulu sebelum
  // bisa masuk ke dashboard/kasir (lihat gating di layout.tsx dashboard & pos).
  const { error: subscriptionError } = await supabase.from("subscriptions").insert({
    business_id: business.id,
    plan_code: "",
    status: "unpaid",
  });

  if (subscriptionError) {
    return { error: subscriptionError.message };
  }

  const copyFromBusinessId = (formData.get("copyFromBusinessId") as string) || null;
  if (copyFromBusinessId) {
    // RLS pada `businesses` sudah membatasi query ini ke milik user sendiri —
    // baris kosong berarti bukan pemiliknya (atau ID salah), jadi dilewati
    // begitu saja tanpa error, bukan diblokir secara eksplisit.
    const { data: sourceBusiness } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", copyFromBusinessId)
      .single();

    if (sourceBusiness) {
      await copyMenuFromBusiness(supabase, business.id, copyFromBusinessId);
    }
  }

  redirect(`/business/${business.id}/billing`);
}
