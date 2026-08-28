"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitTransferResult = { success: true } | { success: false; error: string };

type ItemInput = { id: string; qty: number };

export async function submitLocationTransferRequest(
  slug: string,
  employeeId: string,
  requestingLocationId: string,
  note: string,
  items: ItemInput[],
): Promise<SubmitTransferResult> {
  if (!employeeId) {
    return { success: false, error: "Pilih nama dulu." };
  }
  if (items.length === 0) {
    return { success: false, error: "Belum ada bahan yang diminta." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_location_transfer_request", {
    p_slug: slug,
    p_requesting_location_id: requestingLocationId,
    p_employee_id: employeeId,
    p_note: note || null,
    p_items: items,
  });

  if (error) {
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  return { success: true };
}
