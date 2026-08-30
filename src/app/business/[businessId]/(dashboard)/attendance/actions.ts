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

// Input jam masuk/pulang manual (mis. karyawan lupa absen selfie, atau
// bisnis belum pakai jalur selfie sama sekali) — menulis ke kolom yang sama
// dipakai jalur /absen/[slug], jadi kalau hari itu sudah ada data selfie,
// input manual admin akan menimpanya. Cuma isi kolom yang diberikan (kalau
// jam pulang dikosongkan, check_out_at yang sudah ada TIDAK ikut kehapus —
// upsert tidak menyentuh kolom yang tidak disertakan di payload) supaya
// admin bisa isi jam masuk dulu, jam pulang menyusul nanti tanpa saling
// menimpa. Tidak menyentuh foto/lokasi/late/overtime otomatis (kolom itu
// murni milik jalur selfie).
export async function setAttendanceTime(
  businessId: string,
  employeeId: string,
  date: string,
  checkInTime: string | null,
  checkOutTime: string | null,
): Promise<{ error: string | null }> {
  if (!checkInTime && !checkOutTime) {
    return { error: "Isi jam masuk atau jam pulang dulu." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("attendance").upsert(
    {
      business_id: businessId,
      employee_id: employeeId,
      date,
      status: "hadir",
      ...(checkInTime ? { check_in_at: new Date(`${date}T${checkInTime}:00+07:00`).toISOString() } : {}),
      ...(checkOutTime ? { check_out_at: new Date(`${date}T${checkOutTime}:00+07:00`).toISOString() } : {}),
    },
    { onConflict: "employee_id,date" },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/attendance`);
  return { error: null };
}

// Keterangan izin -- terutama dipakai buat izin weekend: kalau diisi (mis.
// "izin resmi cuti tahunan"), dianggap dispensasi dan dipotong seperti izin
// hari biasa saat hitung gaji (bukan kena denda tambahan weekend). Lihat
// calcPayslip di payroll/calc.ts.
export async function setAttendanceNote(
  businessId: string,
  employeeId: string,
  date: string,
  note: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("attendance")
    .select("id, status")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .eq("date", date)
    .maybeSingle();

  if (!existing || existing.status !== "izin") {
    return { error: "Tandai Izin dulu sebelum isi keterangan." };
  }

  const { error } = await supabase
    .from("attendance")
    .update({ note: note.trim() || null })
    .eq("id", existing.id);

  if (error) {
    return { error: error.message };
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

// Jam lembur per hari -- sebelumnya cuma keisi otomatis dari jalur selfie
// /absen/[slug] (bandingin jam pulang vs jadwal shift). Ini buat isi/ubah
// manual (mis. bisnis belum pakai selfie, atau mau koreksi angka otomatis)
// supaya lembur kerekap harian di Absensi, bukan cuma satu angka gelondongan
// yang diketik pas bikin slip gaji di Payroll (walau field itu masih ada
// buat override terakhir kalau perlu -- lihat CreateSlipButton/
// CreatePayslipForm, defaultHours-nya sudah otomatis dari total sini).
export async function setAttendanceOvertime(
  businessId: string,
  employeeId: string,
  date: string,
  hours: number,
): Promise<{ error: string | null }> {
  if (Number.isNaN(hours) || hours < 0) {
    return { error: "Jam lembur harus angka 0 atau lebih." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("attendance")
    .select("id, status")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .eq("date", date)
    .maybeSingle();

  if (!existing || existing.status !== "hadir") {
    return { error: "Tandai Hadir dulu sebelum mengisi jam lembur." };
  }

  const { error } = await supabase
    .from("attendance")
    .update({ overtime_hours: hours })
    .eq("id", existing.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/attendance`);
  revalidatePath(`/business/${businessId}/attendance/rekap`);
  return { error: null };
}

// Cuma hapus data absen selfie-nya (foto, jam, telat/lembur terdeteksi,
// verifikasi) — status Hadir/Izin/dst yang mungkin sudah ditandai manual
// TIDAK ikut kehapus, biar admin bisa isi ulang manual atau minta
// karyawan absen ulang tanpa kehilangan tandaan lain hari itu.
export async function deleteAttendanceSelfie(
  businessId: string,
  attendanceId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("attendance")
    .update({
      check_in_at: null,
      check_in_photo_url: null,
      check_out_at: null,
      check_out_photo_url: null,
      late_minutes: 0,
      late: false,
      overtime_hours: 0,
      shift_template_id: null,
      verified_by_admin: false,
      verified_at: null,
    })
    .eq("id", attendanceId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/attendance`);
  return { error: null };
}

// Verifikasi cuma jejak audit "admin sudah mengecek foto & jam-nya benar" —
// TIDAK memblokir apa pun. Absen selfie sudah otomatis kehitung (status,
// late_minutes, overtime_hours) begitu masuk lewat /absen/[slug], sebelum
// admin sempat verifikasi.
export async function verifyAttendance(
  businessId: string,
  attendanceId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("attendance")
    .update({ verified_by_admin: true, verified_at: new Date().toISOString() })
    .eq("id", attendanceId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/attendance`);
  return { error: null };
}
