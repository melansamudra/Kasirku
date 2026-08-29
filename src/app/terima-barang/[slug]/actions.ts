"use server";

import { createClient } from "@/lib/supabase/server";

export type ReceivePublicState = { success: boolean; error: string | null };

export async function receiveFulfillmentPublic(
  slug: string,
  fulfillmentId: string,
  employeeId: string,
): Promise<ReceivePublicState> {
  if (!employeeId) {
    return { success: false, error: "Pilih nama dulu." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_stock_fulfillment_public", {
    p_slug: slug,
    p_fulfillment_id: fulfillmentId,
    p_employee_id: employeeId,
  });

  if (error) {
    if (error.message.includes("already received")) {
      return { success: false, error: "Barang ini sudah dikonfirmasi diterima sebelumnya." };
    }
    if (error.message.includes("insufficient stock")) {
      return { success: false, error: "Stok Gudang Utama tidak cukup. Hubungi Purchasing dulu." };
    }
    if (error.message.includes("employee not found")) {
      return { success: false, error: "Nama tidak valid, pilih ulang." };
    }
    if (error.message.includes("fulfillment not found")) {
      return { success: false, error: "Data tidak ditemukan, mungkin sudah diproses. Muat ulang halaman." };
    }
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  return { success: true, error: null };
}
