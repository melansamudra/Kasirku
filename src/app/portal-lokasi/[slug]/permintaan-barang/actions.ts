"use server";

import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";

export type SubmitPurchaseRequestPortalResult = { success: true } | { success: false; error: string };

type RequestItemInput = {
  itemId: string | null;
  newItemName: string | null;
  unit: string | null;
  qtyOrdered: number;
  currentStock: number | null;
};

// employeeId & locationId SENGAJA diambil dari sesi/props server-side, bukan
// dropdown -- staf di portal ini sudah login & lokasinya sudah terkunci ke
// lokasi tempat mereka scan (lihat production-session.ts).
export async function submitPurchaseRequestPortal(
  purchaseRequestSlug: string,
  businessId: string,
  locationId: string,
  note: string,
  items: RequestItemInput[],
): Promise<SubmitPurchaseRequestPortalResult> {
  const session = await getProductionSession(businessId, locationId);
  if (!session) {
    return { success: false, error: "Sesi habis, login ulang." };
  }
  if (items.length === 0) {
    return { success: false, error: "Belum ada barang yang diorder." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_purchase_request", {
    p_slug: purchaseRequestSlug,
    p_employee_id: session.employeeId,
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
