"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AddShiftTemplateState = { error: string | null };

export async function addShiftTemplate(
  businessId: string,
  _prevState: AddShiftTemplateState,
  formData: FormData,
): Promise<AddShiftTemplateState> {
  const name = (formData.get("name") as string)?.trim();
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;

  if (!name) return { error: "Nama shift wajib diisi." };
  if (!startTime || !endTime) return { error: "Jam mulai & selesai wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("shift_templates").insert({
    business_id: businessId,
    name,
    start_time: startTime,
    end_time: endTime,
  });

  if (error) return { error: error.message };

  await logActivity(supabase, businessId, "pengaturan", "sukses", `Shift baru: ${name}`, `${startTime}–${endTime}`);
  revalidatePath(`/business/${businessId}/jadwal-shift`);
  return { error: null };
}

export async function deleteShiftTemplate(
  businessId: string,
  templateId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("shift_templates")
    .delete()
    .eq("id", templateId)
    .eq("business_id", businessId);

  if (error) {
    // Kemungkinan besar masih dipakai di employee_shift_assignments atau
    // attendance (foreign key restrict/no-action bawaan Postgres).
    return {
      error: "Gagal menghapus — shift ini kemungkinan masih dipakai di jadwal atau riwayat absensi.",
    };
  }

  revalidatePath(`/business/${businessId}/jadwal-shift`);
  return { error: null };
}

export async function assignShift(
  businessId: string,
  employeeId: string,
  date: string,
  shiftTemplateId: string | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  if (!shiftTemplateId) {
    const { error } = await supabase
      .from("employee_shift_assignments")
      .delete()
      .eq("business_id", businessId)
      .eq("employee_id", employeeId)
      .eq("date", date);
    if (error) return { error: error.message };
    revalidatePath(`/business/${businessId}/jadwal-shift`);
    return { error: null };
  }

  const { error } = await supabase.from("employee_shift_assignments").upsert(
    { business_id: businessId, employee_id: employeeId, date, shift_template_id: shiftTemplateId },
    { onConflict: "employee_id,date" },
  );

  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}/jadwal-shift`);
  return { error: null };
}

// Urutan parameter sengaja: businessId, employeeId, startDate dulu — supaya
// pemanggil bisa .bind() ketiganya dan menyisakan (shiftTemplateId, days)
// buat diisi client. Server Action wajib dilempar ke Client Component lewat
// bind, bukan dibungkus arrow function biasa (Next.js menolak itu).
export async function applyShiftToRange(
  businessId: string,
  employeeId: string,
  startDate: string,
  shiftTemplateId: string,
  days: number,
): Promise<{ error: string | null }> {
  if (!shiftTemplateId) return { error: "Pilih shift dulu." };
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return { error: "Jumlah hari harus antara 1–90." };
  }

  const supabase = await createClient();
  const rows = Array.from({ length: days }, (_, i) => {
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      business_id: businessId,
      employee_id: employeeId,
      date: d.toISOString().slice(0, 10),
      shift_template_id: shiftTemplateId,
    };
  });

  const { error } = await supabase
    .from("employee_shift_assignments")
    .upsert(rows, { onConflict: "employee_id,date" });

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "info",
    "Jadwal shift diterapkan",
    `${days} hari mulai ${startDate}`,
  );
  revalidatePath(`/business/${businessId}/jadwal-shift`);
  return { error: null };
}

export type RegenerateSlugState = { error: string | null; slug: string | null };

export async function regenerateAttendanceSlug(businessId: string): Promise<RegenerateSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase
    .from("businesses")
    .update({ attendance_qr_slug: slug })
    .eq("id", businessId);

  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link absen selfie diganti");
  revalidatePath(`/business/${businessId}/jadwal-shift`);
  revalidatePath(`/business/${businessId}/attendance`);
  return { error: null, slug };
}
