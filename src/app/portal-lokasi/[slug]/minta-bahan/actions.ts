"use server";

import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";

export type SubmitMintaBahanPortalResult = { success: true } | { success: false; error: string };

type ItemInput = { id: string; qty: number };

// employeeId & locationId SENGAJA diambil dari sesi server-side, bukan
// dropdown -- sama pola dengan action portal lain (kirim/terima/produksi).
export async function submitMintaBahanPortal(
  locationTransferSlug: string,
  businessId: string,
  locationId: string,
  note: string,
  items: ItemInput[],
): Promise<SubmitMintaBahanPortalResult> {
  const session = await getProductionSession(businessId, locationId);
  if (!session) {
    return { success: false, error: "Sesi habis, login ulang." };
  }
  if (items.length === 0) {
    return { success: false, error: "Belum ada bahan yang diminta." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_location_transfer_request", {
    p_slug: locationTransferSlug,
    p_requesting_location_id: locationId,
    p_employee_id: session.employeeId,
    p_note: note || null,
    p_items: items,
  });

  if (error) {
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  return { success: true };
}
