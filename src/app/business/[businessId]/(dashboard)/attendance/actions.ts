"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AttendanceStatus = "hadir" | "izin" | "sakit" | "alpa";

export async function setAttendance(
  businessId: string,
  cashierId: string,
  date: string,
  status: AttendanceStatus,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: cashier } = await supabase
    .from("cashiers")
    .select("name")
    .eq("id", cashierId)
    .eq("business_id", businessId)
    .maybeSingle();

  const { error } = await supabase
    .from("attendance")
    .upsert(
      { business_id: businessId, cashier_id: cashierId, date, status },
      { onConflict: "cashier_id,date" },
    );

  if (error) {
    return { error: error.message };
  }

  if (cashier) {
    await logActivity(
      supabase,
      businessId,
      "sistem",
      status === "alpa" ? "warning" : "info",
      `Absensi ${cashier.name}: ${status}`,
      date,
    );
  }

  revalidatePath(`/business/${businessId}/attendance`);
  return { error: null };
}
