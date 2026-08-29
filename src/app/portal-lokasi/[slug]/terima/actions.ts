"use server";

import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";

export type ReceivePublicState = { success: boolean; error: string | null };

// employeeId SENGAJA diambil dari sesi server-side (cookie), bukan dikirim
// dari client -- konsisten dengan kenapa portal ini dibuat: sekali login,
// tidak perlu pilih nama lagi tiap aksi.
export async function receiveFulfillmentPortal(
  receiveSlug: string,
  businessId: string,
  locationId: string,
  fulfillmentId: string,
): Promise<ReceivePublicState> {
  const session = await getProductionSession(businessId, locationId);
  if (!session) {
    return { success: false, error: "Sesi habis, login ulang." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_stock_fulfillment_public", {
    p_slug: receiveSlug,
    p_fulfillment_id: fulfillmentId,
    p_employee_id: session.employeeId,
  });

  if (error) {
    if (error.message.includes("already received")) {
      return { success: false, error: "Barang ini sudah dikonfirmasi diterima sebelumnya." };
    }
    if (error.message.includes("insufficient stock")) {
      return { success: false, error: "Stok Gudang Utama tidak cukup. Hubungi Purchasing dulu." };
    }
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  return { success: true, error: null };
}
