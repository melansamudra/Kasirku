"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type SemiFinishedProductState = { error: string | null };

// Khusus bisnis cost-control (sell_products_enabled) — produk di sini SELALU
// 1:1 dengan satu Bahan Setengah Jadi, bukan resep bahan baku manual. Nama
// disalin sekali dari item-nya saat dibuat (bukan disinkron terus-menerus),
// sama pola dengan copyMenuFromBusiness di onboarding.
export async function addSemiFinishedProduct(
  businessId: string,
  _prevState: SemiFinishedProductState,
  formData: FormData,
): Promise<SemiFinishedProductState> {
  const semiFinishedItemId = (formData.get("semiFinishedItemId") as string)?.trim();
  const priceRaw = formData.get("price") as string;

  if (!semiFinishedItemId) return { error: "Pilih Bahan Setengah Jadi dulu." };

  const price = Number(priceRaw);
  if (!priceRaw || Number.isNaN(price) || price <= 0) {
    return { error: "Harga jual harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("id, name")
    .eq("id", semiFinishedItemId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!item) return { error: "Bahan Setengah Jadi tidak ditemukan." };

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("business_id", businessId)
    .eq("semi_finished_item_id", semiFinishedItemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) return { error: `"${item.name}" sudah punya produk terhubung.` };

  const { error } = await supabase.from("products").insert({
    business_id: businessId,
    name: item.name,
    price,
    semi_finished_item_id: semiFinishedItemId,
  });

  if (error) return { error: error.message };

  await logActivity(supabase, businessId, "produk", "sukses", `Produk baru: ${item.name}`);
  revalidatePath(`/business/${businessId}/products`);
  return { error: null };
}

export async function editSemiFinishedProductPrice(
  businessId: string,
  productId: string,
  _prevState: SemiFinishedProductState,
  formData: FormData,
): Promise<SemiFinishedProductState> {
  const priceRaw = formData.get("price") as string;
  const price = Number(priceRaw);
  if (!priceRaw || Number.isNaN(price) || price <= 0) {
    return { error: "Harga jual harus angka lebih dari 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ price })
    .eq("id", productId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/products`);
  return { error: null };
}
