"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateReservationStatus(
  businessId: string,
  reservationId: string,
  status: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("reservations")
      .update({ status })
      .eq("id", reservationId)
      .eq("business_id", businessId);

    if (error) return { error: `[${error.code ?? "?"}] ${error.message}` };

    revalidatePath(`/business/${businessId}/reservasi`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? `[exception] ${e.message}` : "Gagal (unknown)." };
  }
}
