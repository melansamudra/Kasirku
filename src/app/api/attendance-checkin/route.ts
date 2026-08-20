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

  if (!slug || !employeeId || (action !== "in" && action !== "out") || !file) {
    return Response.json({ ok: false, error: "Data tidak lengkap." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json({ ok: false, error: "Ukuran foto maksimal 3 MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ ok: false, error: "Format foto harus JPG, PNG, atau WEBP." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("attendance_qr_slug", slug)
    .maybeSingle();

  if (!business) {
    return Response.json({ ok: false, error: "Link absen tidak valid." }, { status: 404 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name")
    .eq("id", employeeId)
    .eq("business_id", business.id)
    .eq("active", true)
    .maybeSingle();

  if (!employee) {
    return Response.json({ ok: false, error: "Karyawan tidak ditemukan/tidak aktif." }, { status: 404 });
  }

  const date = todayWib();

  const { data: existing } = await supabase
    .from("attendance")
    .select("id, check_in_at, check_out_at, shift_template_id")
    .eq("business_id", business.id)
    .eq("employee_id", employeeId)
    .eq("date", date)
    .maybeSingle();

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

  const { data: assignment } = await supabase
    .from("employee_shift_assignments")
    .select("shift_template_id, shift_templates(start_time, end_time)")
    .eq("business_id", business.id)
    .eq("employee_id", employeeId)
    .eq("date", date)
    .maybeSingle();

  const shift = assignment?.shift_templates as unknown as
    | { start_time: string; end_time: string }
    | null;

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${business.id}/${employeeId}/${date}-${action}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("attendance-selfies")
    .upload(path, file, { contentType: file.type, upsert: false });

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
