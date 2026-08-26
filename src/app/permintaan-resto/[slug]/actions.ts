"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitOutletRequestResult = { success: true } | { success: false; error: string };

type RequestItemInput = { itemId: string; qtyRequested: number };

export async function submitOutletRequest(
  slug: string,
  outletId: string,
  employeeId: string,
  note: string,
  items: RequestItemInput[],
): Promise<SubmitOutletRequestResult> {
  if (!outletId) {
    return { success: false, error: "Pilih outlet dulu." };
  }
  if (!employeeId) {
    return { success: false, error: "Pilih nama dulu." };
  }
  if (items.length === 0) {
    return { success: false, error: "Belum ada bahan yang diminta." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_outlet_request", {
    p_slug: slug,
    p_outlet_id: outletId,
    p_employee_id: employeeId,
    p_note: note || null,
    p_items: items.map((i) => ({ itemId: i.itemId, qtyRequested: i.qtyRequested })),
  });

  if (error) {
    return { success: false, error: "Permintaan gagal terkirim. Coba lagi." };
  }

  return { success: true };
}
