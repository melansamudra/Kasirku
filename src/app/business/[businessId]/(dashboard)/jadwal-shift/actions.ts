"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const REPORT_TIMEZONE = "Asia/Jakarta";

function wibMinutesOfDay(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: REPORT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function timeStrToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Dipanggil tiap kali shift di-assign/diganti/dihapus untuk satu
// (employee_id, date) — kalau hari itu sudah kepakai absen selfie duluan
// (urutannya kebalik: absen dulu, shift-nya baru di-set admin belakangan),
// telat/lembur yang sudah tersimpan dihitung ULANG dari jam absen yang
// sudah ada, bukan dibiarkan nyangkut di 0. Tanpa ini, admin yang lupa
// nyiapin jadwal duluan bakal kehilangan deteksi otomatisnya untuk hari
// itu selamanya.
async function recomputeAttendanceForShift(
  supabase: SupabaseServerClient,
  businessId: string,
  employeeId: string,
  date: string,
  shiftTemplateId: string | null,
) {
  const { data: attendance } = await supabase
    .from("attendance")
    .select("id, check_in_at, check_out_at")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .eq("date", date)
    .maybeSingle();

  if (!attendance || (!attendance.check_in_at && !attendance.check_out_at)) {
    return; // Belum ada absen selfie hari itu — tidak ada yang perlu dihitung ulang.
  }

  let shift: { start_time: string; end_time: string } | null = null;
  if (shiftTemplateId) {
    const { data } = await supabase
      .from("shift_templates")
      .select("start_time, end_time")
      .eq("id", shiftTemplateId)
      .eq("business_id", businessId)
      .maybeSingle();
    shift = data;
  }

  const lateMinutes =
    shift && attendance.check_in_at
      ? Math.max(0, wibMinutesOfDay(attendance.check_in_at) - timeStrToMinutes(shift.start_time))
      : 0;
  const overtimeHours =
    shift && attendance.check_out_at
      ? Math.max(
          0,
          Math.round(((wibMinutesOfDay(attendance.check_out_at) - timeStrToMinutes(shift.end_time)) / 60) * 100) /
            100,
        )
      : 0;

  await supabase
    .from("attendance")
    .update({
      shift_template_id: shiftTemplateId,
      late_minutes: lateMinutes,
      late: lateMinutes > 0,
      overtime_hours: overtimeHours,
    })
    .eq("id", attendance.id);
}

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

    await recomputeAttendanceForShift(supabase, businessId, employeeId, date, null);
    revalidatePath(`/business/${businessId}/jadwal-shift`);
    revalidatePath(`/business/${businessId}/attendance`);
    return { error: null };
  }

  const { error } = await supabase.from("employee_shift_assignments").upsert(
    { business_id: businessId, employee_id: employeeId, date, shift_template_id: shiftTemplateId },
    { onConflict: "employee_id,date" },
  );

  if (error) return { error: error.message };

  await recomputeAttendanceForShift(supabase, businessId, employeeId, date, shiftTemplateId);
  revalidatePath(`/business/${businessId}/jadwal-shift`);
  revalidatePath(`/business/${businessId}/attendance`);
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
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(`${startDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const rows = dates.map((date) => ({
    business_id: businessId,
    employee_id: employeeId,
    date,
    shift_template_id: shiftTemplateId,
  }));

  const { error } = await supabase
    .from("employee_shift_assignments")
    .upsert(rows, { onConflict: "employee_id,date" });

  if (error) return { error: error.message };

  // Kalau di antara hari-hari itu ada yang sudah kepakai absen selfie
  // (jarang tapi mungkin, mis. terapkan ke tanggal lampau), hitung ulang
  // juga — sama seperti assignShift satu hari.
  for (const date of dates) {
    await recomputeAttendanceForShift(supabase, businessId, employeeId, date, shiftTemplateId);
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "info",
    "Jadwal shift diterapkan",
    `${days} hari mulai ${startDate}`,
  );
  revalidatePath(`/business/${businessId}/jadwal-shift`);
  revalidatePath(`/business/${businessId}/attendance`);
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
