"use server";

import { createClient } from "@/lib/supabase/server";

export type ReservationState = { error: string | null; success: boolean };

export async function submitReservation(
  slug: string,
  _prevState: ReservationState,
  formData: FormData,
): Promise<ReservationState> {
  const customerName = (formData.get("customerName") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const partySize = Number(formData.get("partySize"));
  const date = formData.get("date") as string;
  const time = formData.get("time") as string;
  const note = ((formData.get("note") as string) ?? "").trim() || null;

  if (!customerName) return { error: "Nama wajib diisi.", success: false };
  if (!phone) return { error: "Nomor telepon wajib diisi.", success: false };
  if (!partySize || partySize <= 0) return { error: "Jumlah tamu tidak valid.", success: false };
  if (!date || !time) return { error: "Tanggal dan jam wajib diisi.", success: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_public_reservation", {
    p_storefront_slug: slug,
    p_customer_name: customerName,
    p_phone: phone,
    p_party_size: partySize,
    p_reservation_date: date,
    p_reservation_time: time,
    p_note: note,
  });

  if (error) return { error: error.message, success: false };
  return { error: null, success: true };
}
