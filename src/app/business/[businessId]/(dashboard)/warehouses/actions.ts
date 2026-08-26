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
