"use server";

import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";

export type FulfillTransferState = { error: string | null };

// Sama seperti terima/actions.ts -- employeeId dari sesi, RPC ini pakai
// slug PORTAL langsung (bukan slug terpisah kayak Terima Barang/Stok
// Opname, karena Transfer Internal memang belum punya link publik lain).
export async function fulfillTransferPortal(
  slug: string,
  businessId: string,
  locationId: string,
  transferId: string,
  qtySent: { itemId: string; qty: number }[],
): Promise<FulfillTransferState> {
  const session = await getProductionSession(businessId, locationId);
  if (!session) {
    return { error: "Sesi habis, login ulang." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fulfill_location_transfer_public", {
    p_slug: slug,
    p_employee_id: session.employeeId,
    p_transfer_id: transferId,
    p_qty_sent: qtySent,
  });

  if (error) {
    if (error.message.includes("insufficient stock")) {
      return { error: "Stok tidak cukup untuk kirim jumlah ini." };
    }
    if (error.message.includes("already fulfilled")) {
      return { error: "Permintaan ini sudah diproses sebelumnya." };
    }
    if (error.message.includes("nothing sent")) {
      return { error: "Isi jumlah yang dikirim untuk minimal 1 bahan." };
    }
    return { error: "Gagal mengirim. Coba lagi." };
  }

  return { error: null };
}
