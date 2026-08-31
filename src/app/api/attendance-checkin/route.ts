import { createServiceClient } from "@/lib/supabase/service";

// Staf tidak login (buka link publik pakai slug), jadi tidak ada session
// buat di-scope lewat RLS biasa — pola ini dipakai persis seperti alasan
// service.ts didokumentasikan boleh dipakai: "guest checkout writing to
// zero-RLS tables". Business & employee tetap divalidasi manual di sini
// sebelum tulis apa pun (slug adalah token akses acak, employeeId harus
// benar-benar milik business yang sama).

const MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const REPORT_TIMEZONE = "Asia/Jakarta";

function todayWib() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE });
}

function nowWibMinutesOfDay() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: REPORT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function timeStrToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function nowWibTimeLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: REPORT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const slug = formData.get("slug") as string | null;
  const employeeId = formData.get("employeeId") as string | null;
  const action = formData.get("action") as string | null;
  const file = formData.get("photo") as File | null;
  const latRaw = formData.get("lat") as string | null;
  const lngRaw = formData.get("lng") as string | null;
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;

  const isBreakAction = action === "break-start" || action === "break-end";

  if (!slug || !employeeId || (action !== "in" && action !== "out" && !isBreakAction)) {
    return Response.json({ ok: false, error: "Data tidak lengkap." }, { status: 400 });
  }
  // Absen istirahat sengaja TANPA foto -- cuma toggle kecil, beda dengan
  // absen masuk/pulang yang wajib selfie buat verifikasi kehadiran fisik.
  if (!isBreakAction) {
    if (!file) {
      return Response.json({ ok: false, error: "Data tidak lengkap." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return Response.json({ ok: false, error: "Ukuran foto maksimal 3 MB." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ ok: false, error: "Format foto harus JPG, PNG, atau WEBP." }, { status: 400 });
    }
  }

  const supabase = createServiceClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, break_attendance_enabled")
    .eq("attendance_qr_slug", slug)
    .maybeSingle();

  if (!business) {
    return Response.json({ ok: false, error: "Link absen tidak valid." }, { status: 404 });
  }
  if (isBreakAction && !business.break_attendance_enabled) {
    return Response.json({ ok: false, error: "Fitur absen istirahat belum aktif untuk bisnis ini." }, { status: 403 });
  }

  const date = todayWib();

  // employee/existing-attendance/shift-assignment cuma butuh business.id —
  // tidak saling bergantung, jadi ditembak bareng lewat Promise.all daripada
  // 3 round-trip berurutan (ini penyumbang terbesar lambatnya submit absen
  // di jaringan outlet yang kurang stabil). Upload foto SENGAJA tidak
  // ditaruh di sini juga — baru dijalankan setelah validasi employee/
  // sudah-absen lolos, supaya tap dobel/percobaan tidak valid tidak buang
  // waktu+kuota upload foto yang ujung-ujungnya dibuang.
  const [{ data: employee }, { data: existing }, { data: assignment }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name")
      .eq("id", employeeId)
      .eq("business_id", business.id)
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("attendance")
      .select("id, check_in_at, check_out_at, shift_template_id, break_start_at, break_end_at")
      .eq("business_id", business.id)
      .eq("employee_id", employeeId)
      .eq("date", date)
      .maybeSingle(),
    supabase
      .from("employee_shift_assignments")
      .select("shift_template_id, shift_templates(start_time, end_time)")
      .eq("business_id", business.id)
      .eq("employee_id", employeeId)
      .eq("date", date)
      .maybeSingle(),
  ]);

  if (!employee) {
    return Response.json({ ok: false, error: "Karyawan tidak ditemukan/tidak aktif." }, { status: 404 });
  }

  if (action === "in" && existing?.check_in_at) {
    return Response.json({
      ok: true,
      message: `${employee.name} sudah absen masuk hari ini jam ${new Date(existing.check_in_at).toLocaleTimeString("id-ID", { timeZone: REPORT_TIMEZONE, hour: "2-digit", minute: "2-digit" })}.`,
    });
  }
  if (action === "out" && !existing?.check_in_at) {
    return Response.json({ ok: false, error: "Belum absen masuk hari ini — absen masuk dulu." }, { status: 400 });
  }
  if (action === "out" && existing?.check_out_at) {
    return Response.json({
      ok: true,
      message: `${employee.name} sudah absen pulang hari ini jam ${new Date(existing.check_out_at).toLocaleTimeString("id-ID", { timeZone: REPORT_TIMEZONE, hour: "2-digit", minute: "2-digit" })}.`,
    });
  }

  // Istirahat cuma valid di antara absen masuk & pulang, tanpa foto -- jadi
  // di-handle terpisah di sini, sebelum masuk ke alur upload selfie di bawah.
  if (isBreakAction) {
    if (!existing?.check_in_at) {
      return Response.json({ ok: false, error: "Belum absen masuk hari ini — absen masuk dulu." }, { status: 400 });
    }
    if (existing.check_out_at) {
      return Response.json({ ok: false, error: "Sudah absen pulang hari ini — istirahat tidak berlaku lagi." }, { status: 400 });
    }
    if (action === "break-start") {
      if (existing.break_start_at && !existing.break_end_at) {
        return Response.json({
          ok: true,
          message: `${employee.name} sudah mulai istirahat jam ${new Date(existing.break_start_at).toLocaleTimeString("id-ID", { timeZone: REPORT_TIMEZONE, hour: "2-digit", minute: "2-digit" })}.`,
          onBreak: true,
        });
      }
      const { error } = await supabase
        .from("attendance")
        .update({ break_start_at: new Date().toISOString(), break_end_at: null })
        .eq("id", existing.id);
      if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
      return Response.json({ ok: true, message: `Mulai istirahat jam ${nowWibTimeLabel()}.`, onBreak: true });
    }
    // action === "break-end"
    if (!existing.break_start_at) {
      return Response.json({ ok: false, error: "Belum mulai istirahat." }, { status: 400 });
    }
    if (existing.break_end_at) {
      return Response.json({
        ok: true,
        message: `${employee.name} sudah selesai istirahat jam ${new Date(existing.break_end_at).toLocaleTimeString("id-ID", { timeZone: REPORT_TIMEZONE, hour: "2-digit", minute: "2-digit" })}.`,
        onBreak: false,
      });
    }
    const { error } = await supabase
      .from("attendance")
      .update({ break_end_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, message: `Selesai istirahat jam ${nowWibTimeLabel()}.`, onBreak: false });
  }

  const shift = assignment?.shift_templates as unknown as
    | { start_time: string; end_time: string }
    | null;

  // Sudah dipastikan non-null di validasi awal (cuma break-start/break-end
  // yang boleh tanpa foto, dan itu sudah return lebih dulu di atas).
  const selfieFile = file!;
  const ext = selfieFile.type === "image/png" ? "png" : selfieFile.type === "image/webp" ? "webp" : "jpg";
  const path = `${business.id}/${employeeId}/${date}-${action}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("attendance-selfies")
    .upload(path, selfieFile, { contentType: selfieFile.type, upsert: false });

  if (uploadError) {
    return Response.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("attendance-selfies").getPublicUrl(path);

  if (action === "in") {
    const nowMinutes = nowWibMinutesOfDay();
    const lateMinutes = shift ? Math.max(0, nowMinutes - timeStrToMinutes(shift.start_time)) : 0;

    const { error } = await supabase.from("attendance").upsert(
      {
        business_id: business.id,
        employee_id: employeeId,
        date,
        status: "hadir",
        late: lateMinutes > 0,
        late_minutes: lateMinutes,
        check_in_at: new Date().toISOString(),
        check_in_photo_url: publicUrl,
        check_in_lat: lat,
        check_in_lng: lng,
        shift_template_id: assignment?.shift_template_id ?? null,
      },
      { onConflict: "employee_id,date" },
    );

    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

    const message = shift
      ? lateMinutes > 0
        ? `Absen masuk jam ${nowWibTimeLabel()} — terlambat ${lateMinutes} menit dari jadwal ${shift.start_time.slice(0, 5)}.`
        : `Absen masuk jam ${nowWibTimeLabel()} — tepat waktu.`
      : `Absen masuk jam ${nowWibTimeLabel()} — belum ada jadwal shift hari ini, telat tidak dihitung.`;

    return Response.json({ ok: true, message, lateMinutes });
  }

  // action === "out"
  const nowMinutes = nowWibMinutesOfDay();
  const overtimeHours = shift
    ? Math.max(0, Math.round(((nowMinutes - timeStrToMinutes(shift.end_time)) / 60) * 100) / 100)
    : 0;

  const { error } = await supabase
    .from("attendance")
    .update({
      check_out_at: new Date().toISOString(),
      check_out_photo_url: publicUrl,
      check_out_lat: lat,
      check_out_lng: lng,
      overtime_hours: overtimeHours,
    })
    .eq("id", existing!.id);

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const message = shift
    ? overtimeHours > 0
      ? `Absen pulang jam ${nowWibTimeLabel()} — lembur ${overtimeHours} jam dari jadwal ${shift.end_time.slice(0, 5)}.`
      : `Absen pulang jam ${nowWibTimeLabel()}.`
    : `Absen pulang jam ${nowWibTimeLabel()} — belum ada jadwal shift hari ini, lembur tidak dihitung.`;

  return Response.json({ ok: true, message, overtimeHours });
}
