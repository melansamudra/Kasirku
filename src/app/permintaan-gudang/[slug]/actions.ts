"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitWarehouseRequestResult = { success: true } | { success: false; error: string };

type RequestItemInput = { itemId: string; qtyRequested: number };

export async function submitWarehouseRequest(
  slug: string,
  warehouseId: string,
  employeeId: string,
  note: string,
  items: RequestItemInput[],
): Promise<SubmitWarehouseRequestResult> {
  if (!warehouseId) {
    return { success: false, error: "Pilih gudang dulu." };
  }
  if (!employeeId) {
    return { success: false, error: "Pilih nama dulu." };
  }
  if (items.length === 0) {
    return { success: false, error: "Belum ada bahan yang diminta." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_warehouse_request", {
    p_slug: slug,
    p_warehouse_id: warehouseId,
    p_employee_id: employeeId,
    p_note: note || null,
    p_items: items.map((i) => ({ itemId: i.itemId, qtyRequested: i.qtyRequested })),
  });

  if (error) {
    return { success: false, error: "Permintaan gagal terkirim. Coba lagi." };
  }

  return { success: true };
}
