"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ClosePeriodResult = { error: string | null };

export async function closePeriod(
  businessId: string,
  periodEnd: string,
): Promise<ClosePeriodResult> {
  if (!periodEnd) {
    return { error: "Tanggal wajib diisi." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("close_accounting_period", {
    p_business_id: businessId,
    p_period_end: periodEnd,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "sukses",
    `Tutup buku periode s/d ${periodEnd}`,
  );

  revalidatePath(`/business/${businessId}/accounting/tutup-buku`);
  revalidatePath(`/business/${businessId}/accounting/neraca`);
  revalidatePath(`/business/${businessId}/accounting/jurnal`);
  return { error: null };
}
