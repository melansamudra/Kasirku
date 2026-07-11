"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AttendanceStatus = "hadir" | "izin" | "sakit" | "alpa";

export async function setAttendance(
  businessId: string,
  employeeId: string,
  date: string,
  status: AttendanceStatus,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("name")
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .maybeSingle();

  const { error } = await supabase
    .from("attendance")
    .upsert(
      { business_id: businessId, employee_id: employeeId, date, status },
      { onConflict: "employee_id,date" },
    );

  if (error) {
    return { error: error.message };
  }

  if (employee) {
    await logActivity(
      supabase,
      businessId,
      "sistem",
      status === "alpa" ? "warning" : "info",
      `Absensi ${employee.name}: ${status}`,
      date,
    );
  }

  revalidatePath(`/business/${businessId}/attendance`);
  return { error: null };
}
