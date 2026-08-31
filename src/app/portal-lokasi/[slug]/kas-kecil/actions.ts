"use server";

import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";

export type SubmitKasKecilPortalResult =
  | { success: true; message: string }
  | { success: false; error: string };

// employeeId SENGAJA diambil dari sesi server-side (cookie PIN), bukan
// dikirim dari client -- sama pola dengan produksi/kirim/terima. Portal ini
// cuma buat "Nota Tunai" (pengeluaran) -- Nota Hutang & Kasbon butuh pilih
// supplier/debitur, tetap lewat dashboard.
export async function submitKasKecilPortal(
  portalSlug: string,
  businessId: string,
  locationId: string,
  amount: number,
  category: string,
  description: string,
): Promise<SubmitKasKecilPortalResult> {
  const session = await getProductionSession(businessId, locationId);
  if (!session) {
    return { success: false, error: "Sesi habis, login ulang." };
  }
  if (!(amount > 0)) {
    return { success: false, error: "Jumlah harus lebih dari 0." };
  }
  if (!description.trim()) {
    return { success: false, error: "Isi keterangan pengeluaran." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_petty_cash_expense_public", {
    p_slug: portalSlug,
    p_employee_id: session.employeeId,
    p_amount: amount,
    p_category: category,
    p_description: description.trim(),
  });

  if (error) {
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  return { success: true, message: "Tersimpan! Menunggu diklasifikasi Cost Control." };
}
