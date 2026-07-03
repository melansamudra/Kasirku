"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AddIngredientState = { error: string | null };

export async function addIngredient(
  businessId: string,
  _prevState: AddIngredientState,
  formData: FormData,
): Promise<AddIngredientState> {
  const name = (formData.get("name") as string)?.trim();
  const unit = (formData.get("unit") as string)?.trim();
  const unitCostRaw = formData.get("unitCost") as string;
  const stockRaw = formData.get("stock") as string;

  if (!name) {
    return { error: "Nama bahan wajib diisi." };
  }
  if (!unit) {
    return { error: "Satuan wajib diisi (mis. gr, ml, pcs)." };
  }

  const unitCost = unitCostRaw ? Number(unitCostRaw) : 0;
  if (Number.isNaN(unitCost) || unitCost < 0) {
    return { error: "Harga per satuan harus angka dan tidak boleh negatif." };
  }

  const stock = stockRaw ? Number(stockRaw) : 0;
  if (Number.isNaN(stock) || stock < 0) {
    return { error: "Stok harus angka dan tidak boleh negatif." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").insert({
    business_id: businessId,
    name,
    unit,
    unit_cost: unitCost,
    stock,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Bahan baku baru: ${name}`,
    `Stok ${stock} ${unit}`,
  );
  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}
