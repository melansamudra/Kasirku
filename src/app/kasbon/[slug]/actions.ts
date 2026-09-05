"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitKasbonPublicResult = { success: true } | { success: false; error: string };

export async function submitKasbonPublic(
  slug: string,
  employeeId: string,
  amount: number,
  note: string,
  date: string,
): Promise<SubmitKasbonPublicResult> {
  if (!employeeId) {
    return { success: false, error: "Pilih nama dulu." };
  }
  if (!(amount > 0)) {
    return { success: false, error: "Jumlah harus lebih dari 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_petty_cash_kasbon_public", {
    p_slug: slug,
    p_employee_id: employeeId,
    p_amount: amount,
    p_note: note.trim() || null,
    p_date: date || null,
  });

  if (error) {
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  return { success: true };
}
