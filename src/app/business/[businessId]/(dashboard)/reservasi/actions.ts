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

// Blokir meja dari reservasi online (mis. lagi rusak / dipakai reservasi
// manual di tempat) -- diwujudkan sebagai baris reservations biasa supaya
// otomatis kehitung "taken" oleh get_storefront_table_availability(), tanpa
// perlu ubah logika availability itu sendiri.
export async function blockTableForDate(
  businessId: string,
  tableId: string,
  date: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("reservations").insert({
      business_id: businessId,
      table_id: tableId,
      customer_name: "(Diblokir manual)",
      phone: "-",
      party_size: 1,
      reservation_date: date,
      reservation_time: "00:00",
      status: "confirmed",
      is_manual_block: true,
    });

    if (error) return { error: `[${error.code ?? "?"}] ${error.message}` };

    revalidatePath(`/business/${businessId}/reservasi`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? `[exception] ${e.message}` : "Gagal (unknown)." };
  }
}

export async function unblockTable(
  businessId: string,
  reservationId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("reservations")
      .delete()
      .eq("id", reservationId)
      .eq("business_id", businessId)
      .eq("is_manual_block", true);

    if (error) return { error: `[${error.code ?? "?"}] ${error.message}` };

    revalidatePath(`/business/${businessId}/reservasi`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? `[exception] ${e.message}` : "Gagal (unknown)." };
  }
}
