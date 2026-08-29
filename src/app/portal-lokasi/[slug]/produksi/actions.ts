"use server";

import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";

export type SubmitProduksiPortalResult =
  | { success: true; message: string }
  | { success: false; error: string };

export type ReportedIngredientInput =
  | { ingredientId: string; qty: number }
  | { newName: string; newUnit: string; qty: number };

// employeeId SENGAJA diambil dari sesi server-side (cookie), bukan dikirim
// dari client -- sama pola dengan terima/actions.ts & kirim/actions.ts.
export async function submitProduksiPortal(
  productionScanSlug: string,
  businessId: string,
  locationId: string,
  item: { itemId: string } | { newName: string; newUnit: string },
  qtyProduced: number,
  note: string,
  reportedIngredients: ReportedIngredientInput[],
): Promise<SubmitProduksiPortalResult> {
  const session = await getProductionSession(businessId, locationId);
  if (!session) {
    return { success: false, error: "Sesi habis, login ulang." };
  }
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
    p_slug: productionScanSlug,
    p_item_id: "itemId" in item ? item.itemId : null,
    p_qty: qtyProduced,
    p_employee_id: session.employeeId,
    p_note: note || null,
    p_new_item_name: "newName" in item ? item.newName.trim() : null,
    p_new_item_unit: "newName" in item ? item.newUnit.trim() : null,
    p_reported_ingredients: reportedIngredients.map((r) => ({
      ingredientId: "ingredientId" in r ? r.ingredientId : null,
      newName: "newName" in r ? r.newName.trim() : null,
      newUnit: "newUnit" in r ? r.newUnit.trim() : null,
      qty: r.qty,
    })),
  });

  if (error) {
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  return {
    success: true,
    message:
      "newName" in item
        ? "Tersimpan! Supervisor akan tentukan bahan ini digabung ke item lama atau dibuat baru."
        : "Tersimpan sebagai draft! Menunggu diverifikasi supervisor.",
  };
}
