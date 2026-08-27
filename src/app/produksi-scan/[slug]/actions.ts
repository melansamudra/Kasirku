"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitProductionScanResult = { success: true } | { success: false; error: string };

export async function submitProductionScan(
  slug: string,
  itemId: string,
  qtyProduced: number,
  employeeId: string,
  note: string,
): Promise<SubmitProductionScanResult> {
  if (!itemId) {
    return { success: false, error: "Pilih atau scan bahan dulu." };
  }
  if (!(qtyProduced > 0)) {
    return { success: false, error: "Jumlah harus lebih dari 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_production_scan", {
    p_slug: slug,
    p_item_id: itemId,
    p_qty: qtyProduced,
    p_employee_id: employeeId || null,
    p_note: note || null,
  });

  if (error) {
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  return { success: true };
}
