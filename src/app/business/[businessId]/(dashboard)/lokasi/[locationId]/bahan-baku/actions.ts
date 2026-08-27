"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AdjustStockResult = { error: string | null };

// Sama pola dengan adjustIngredientStock (ingredients/actions.ts), cuma
// menyasar ingredient_location_stock (baris per lokasi) alih-alih kolom
// ingredients.stock tunggal -- lihat catatan di migrasi stock_locations
// kenapa keduanya sengaja dipisah.
export async function adjustIngredientLocationStock(
  businessId: string,
  locationId: string,
  ingredientId: string,
  newStock: number,
  reason: string,
): Promise<AdjustStockResult> {
  if (Number.isNaN(newStock) || newStock < 0) {
    return { error: "Stok fisik harus angka dan tidak boleh negatif." };
  }
  reason = reason.trim();
  if (!reason) {
    return { error: "Alasan penyesuaian wajib diisi." };
  }

  const supabase = await createClient();

  const [{ data: location }, { data: ingredient }, { data: existingRow }] = await Promise.all([
    supabase.from("stock_locations").select("id").eq("id", locationId).eq("business_id", businessId).maybeSingle(),
    supabase
      .from("ingredients")
      .select("id, name, unit")
      .eq("id", ingredientId)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("ingredient_location_stock")
      .select("id, stock")
      .eq("location_id", locationId)
      .eq("ingredient_id", ingredientId)
      .maybeSingle(),
  ]);

  if (!location) {
    return { error: "Lokasi tidak ditemukan." };
  }
  if (!ingredient) {
    return { error: "Bahan baku tidak ditemukan." };
  }

  const stockBefore = Number(existingRow?.stock ?? 0);
  const diff = newStock - stockBefore;

  if (diff === 0) {
    return { error: "Stok fisik sama dengan stok sistem, tidak ada yang disesuaikan." };
  }

  const { error: upsertError } = await supabase.from("ingredient_location_stock").upsert(
    {
      business_id: businessId,
      location_id: locationId,
      ingredient_id: ingredientId,
      stock: newStock,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "location_id,ingredient_id" },
  );

  if (upsertError) {
    return { error: upsertError.message };
  }

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    ingredient_id: ingredientId,
    location_id: locationId,
    item_name: ingredient.name,
    unit: ingredient.unit,
    stock_before: stockBefore,
    stock_after: newStock,
    diff,
    reason,
  });

  await logActivity(
    supabase,
    businessId,
    "produk",
    "info",
    `Stok ${ingredient.name} disesuaikan`,
    `${stockBefore} → ${newStock} ${ingredient.unit} (${reason})`,
  );

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null };
}
