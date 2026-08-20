"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AttendanceStatus = "hadir" | "izin" | "sakit" | "alpa" | "off";

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

  // Kalau status diganti ke selain "hadir", tandai terlambat ikut direset —
  // keterlambatan cuma masuk akal buat hari yang beneran hadir, jangan
  // sampai nyangkut true di hari izin/sakit/alpa/off gara-gara status
  // sebelumnya sempat hadir+terlambat.
  const { error } = await supabase.from("attendance").upsert(
    {
      business_id: businessId,
      employee_id: employeeId,
      date,
      status,
      ...(status !== "hadir" ? { late: false } : {}),
    },
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

export async function setAttendanceLate(
  businessId: string,
  employeeId: string,
  date: string,
  late: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("attendance")
    .select("id, status")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .eq("date", date)
    .maybeSingle();

  if (!existing || existing.status !== "hadir") {
    return { error: "Tandai Hadir dulu sebelum menandai terlambat." };
  }

  const { error } = await supabase.from("attendance").update({ late }).eq("id", existing.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/attendance`);
  return { error: null };
}
