"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitProductionScanResult = { success: true } | { success: false; error: string };

export async function submitProductionScan(
  slug: string,
  item: { itemId: string } | { newName: string; newUnit: string },
  qtyProduced: number,
  employeeId: string,
  note: string,
): Promise<SubmitProductionScanResult> {
  if ("itemId" in item && !item.itemId) {
    return { success: false, error: "Pilih bahan dulu." };
  }
  if ("newName" in item && (!item.newName.trim() || !item.newUnit.trim())) {
    return { success: false, error: "Isi nama dan satuan bahan baru." };
  }
  if (!(qtyProduced > 0)) {
    return { success: false, error: "Jumlah harus lebih dari 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_production_scan", {
    p_slug: slug,
    p_item_id: "itemId" in item ? item.itemId : null,
    p_qty: qtyProduced,
    p_employee_id: employeeId || null,
    p_note: note || null,
    p_new_item_name: "newName" in item ? item.newName.trim() : null,
    p_new_item_unit: "newName" in item ? item.newUnit.trim() : null,
  });

  if (error) {
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  return { success: true };
}
