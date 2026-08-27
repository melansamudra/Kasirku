"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitPurchaseRequestResult =
  | { success: true }
  | { success: false; error: string };

type RequestItemInput = {
  itemId: string | null;
  newItemName: string | null;
  unit: string | null;
  qtyOrdered: number;
  currentStock: number | null;
};

export async function submitPurchaseRequest(
  slug: string,
  employeeId: string,
  note: string,
  items: RequestItemInput[],
  locationId: string | null = null,
): Promise<SubmitPurchaseRequestResult> {
  if (!employeeId) {
    return { success: false, error: "Pilih nama dulu." };
  }
  if (items.length === 0) {
    return { success: false, error: "Belum ada barang yang diorder." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_purchase_request", {
    p_slug: slug,
    p_employee_id: employeeId,
    p_note: note || null,
    p_items: items.map((i) => ({
      itemId: i.itemId,
      newItemName: i.newItemName,
      unit: i.unit,
      qtyOrdered: i.qtyOrdered,
      currentStock: i.currentStock,
    })),
    p_location_id: locationId,
  });

  if (error) {
    return { success: false, error: "Order gagal terkirim. Coba lagi." };
  }

  return { success: true };
}
