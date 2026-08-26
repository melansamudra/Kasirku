"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ActionState = { error: string | null };

// Gudang Kering/Basah bisa ditambah bebas (kind selalu 'bahan_baku' — Gudang
// Setengah Jadi itu satu baris tunggal yang sudah di-seed lewat migration,
// tidak dibuat lewat form ini).
export async function addWarehouse(
  businessId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get("name") as string)?.trim();
  if (!name) {
    return { error: "Nama gudang wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("warehouses").insert({
    business_id: businessId,
    name,
    kind: "bahan_baku",
  });

  if (error) {
    return { error: error.message.includes("duplicate") ? "Nama gudang sudah dipakai." : error.message };
  }

  await logActivity(supabase, businessId, "produk", "sukses", `Gudang baru: ${name}`);
  revalidatePath(`/business/${businessId}/warehouses`);
  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}

// "Gudang minta barang" — Gudang Kering/Basah minta bahan ke Purchasing,
// Purchasing langsung menyiapkan (tanpa approval, sesuai konfirmasi owner):
// buffer Gudang Purchasing berkurang, ingredients.stock (siap pakai di
// gudang tujuan bahan itu) bertambah. Gudang tujuan otomatis ikut penanda
// warehouse_id yang sudah ditandai di halaman Bahan Baku — tidak perlu
// dipilih ulang di sini.
export async function distributeToWarehouse(
  businessId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ingredientId = formData.get("ingredientId") as string;
  const qtyRaw = formData.get("qty") as string;
  const qty = Number(qtyRaw);

  if (!ingredientId) return { error: "Pilih bahan yang mau disalurkan." };
  if (!qtyRaw || Number.isNaN(qty) || qty <= 0) return { error: "Qty harus angka lebih dari 0." };

  const supabase = await createClient();

  const { data: ingredient } = await supabase
    .from("ingredients")
    .select("id, name, stock, warehouse_id")
    .eq("id", ingredientId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!ingredient) return { error: "Bahan baku tidak ditemukan." };
  if (!ingredient.warehouse_id) {
    return { error: `${ingredient.name} belum ditandai ke Gudang Kering/Basah mana pun.` };
  }

  const { data: purchasingWarehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("business_id", businessId)
    .eq("kind", "purchasing")
    .maybeSingle();
  if (!purchasingWarehouse) return { error: "Gudang Purchasing tidak ditemukan." };

  const { data: bufferRow } = await supabase
    .from("warehouse_stock")
    .select("id, stock")
    .eq("warehouse_id", purchasingWarehouse.id)
    .eq("ingredient_id", ingredientId)
    .maybeSingle();

  const bufferStock = Number(bufferRow?.stock ?? 0);
  if (bufferStock < qty - 1e-9) {
    return { error: `Stok ${ingredient.name} di Gudang Purchasing cuma ${bufferStock}, tidak cukup untuk ${qty}.` };
  }

  const { error: bufferError } = await supabase
    .from("warehouse_stock")
    .update({ stock: bufferStock - qty })
    .eq("id", bufferRow!.id);
  if (bufferError) return { error: bufferError.message };

  const { error: stockError } = await supabase
    .from("ingredients")
    .update({ stock: Number(ingredient.stock) + qty })
    .eq("id", ingredientId);
  if (stockError) return { error: stockError.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Salur dari Gudang Purchasing: ${ingredient.name}`,
    `${qty} disalurkan ke gudang tujuan`,
  );

  revalidatePath(`/business/${businessId}/warehouses`);
  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}

export async function updateWarehousePic(
  businessId: string,
  warehouseId: string,
  employeeId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("warehouses")
    .update({ pic_employee_id: employeeId || null })
    .eq("id", warehouseId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/warehouses`);
  return { error: null };
}
