import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Clock, Thermometer, UserX, CalendarOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import {
  setAttendance,
  setAttendanceNote,
  setAttendanceLate,
  setAttendanceTime,
  setAttendanceOvertime,
  verifyAttendance,
  deleteAttendanceSelfie,
  type AttendanceStatus,
} from "./actions";
import AttendanceRow, { type SelfieInfo } from "./attendance-row";
import AttendanceDatePicker from "./attendance-date-picker";
import AttendanceLinkSection from "../jadwal-shift/attendance-link-section";
import { regenerateAttendanceSlug } from "../jadwal-shift/actions";

const REPORT_TIMEZONE = "Asia/Jakarta";

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE });
}

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { businessId } = await params;
  const { date: dateParam } = await searchParams;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayStr();

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, attendance_qr_slug")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const boundRegenerateSlug = regenerateAttendanceSlug.bind(null, businessId);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select(
      "id, employee_id, status, late, note, check_in_at, check_in_photo_url, check_in_lat, check_in_lng, check_out_at, check_out_photo_url, check_out_lat, check_out_lng, late_minutes, overtime_hours, verified_by_admin",
    )
    .eq("business_id", businessId)
    .eq("date", date);

  const statusByEmployee = new Map(
    (attendanceRows ?? []).map((r) => [r.employee_id, r.status as AttendanceStatus]),
  );
  const lateByEmployee = new Map((attendanceRows ?? []).map((r) => [r.employee_id, r.late]));
  const noteByEmployee = new Map((attendanceRows ?? []).map((r) => [r.employee_id, r.note]));
  const selfieByEmployee = new Map<string, SelfieInfo>(
    (attendanceRows ?? []).map((r) => [
      r.employee_id,
      {
        attendanceId: r.id,
        checkInAt: r.check_in_at,
        checkInPhotoUrl: r.check_in_photo_url,
        checkInLat: r.check_in_lat,
        checkInLng: r.check_in_lng,
        checkOutAt: r.check_out_at,
        checkOutPhotoUrl: r.check_out_photo_url,
        checkOutLat: r.check_out_lat,
        checkOutLng: r.check_out_lng,
        lateMinutes: r.late_minutes,
        overtimeHours: Number(r.overtime_hours),
        verified: r.verified_by_admin,
      },
    ]),
  );

  const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, off: 0 };
  for (const status of statusByEmployee.values()) {
    counts[status] += 1;
  }
  const lateCount = (attendanceRows ?? []).filter((r) => r.late).length;

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Absensi — {business.name}</h1>

        <div className="mt-3 rounded-xl bg-white shadow-sm p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Link Absen Selfie</h2>
          <p className="mt-1 mb-3 text-xs text-zinc-500">
            Karyawan buka link ini di HP masing-masing untuk absen masuk/pulang pakai selfie — tidak
            perlu akun kasir.
          </p>
          <AttendanceLinkSection
            businessId={businessId}
            initialSlug={business.attendance_qr_slug ?? ""}
            regenerateAction={boundRegenerateSlug}
          />
        </div>

        <AttendanceDatePicker
          businessId={businessId}
          date={date}
          today={todayStr()}
          label={formatDateLabel(date)}
        />

        {employees && employees.length > 0 && (
          <Link
            href={`/business/${businessId}/attendance/rekap`}
            className="mt-3 flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
          >
            Lihat Rekap Bulanan
            <span className="text-brand-600">→</span>
          </Link>
        )}

        {employees && employees.length > 0 && (
          <div className="mt-4 grid grid-cols-5 gap-2">
            <StatCard label="Hadir" value={String(counts.hadir)} icon={CalendarCheck} tone="brand" />
            <StatCard label="Izin" value={String(counts.izin)} icon={Clock} tone="amber" />
            <StatCard label="Sakit" value={String(counts.sakit)} icon={Thermometer} tone="blue" />
            <StatCard label="Alpa" value={String(counts.alpa)} icon={UserX} tone="red" />
            <StatCard label="Off" value={String(counts.off)} icon={CalendarOff} tone="zinc" />
          </div>
        )}

        {lateCount > 0 && (
          <p className="mt-2 text-xs font-medium text-amber-600">
            ⏰ {lateCount} karyawan tercatat terlambat hari ini
          </p>
        )}

        <div className="mt-4 space-y-2">
          {employees && employees.length > 0 ? (
            employees.map((e) => (
              <AttendanceRow
                key={e.id}
                employeeName={e.name}
                currentStatus={statusByEmployee.get(e.id) ?? null}
                late={lateByEmployee.get(e.id) ?? false}
                note={noteByEmployee.get(e.id) ?? null}
                action={setAttendance.bind(null, businessId, e.id, date)}
                noteAction={setAttendanceNote.bind(null, businessId, e.id, date)}
                lateAction={setAttendanceLate.bind(null, businessId, e.id, date)}
                timeAction={setAttendanceTime.bind(null, businessId, e.id, date)}
                overtimeHours={selfieByEmployee.get(e.id)?.overtimeHours ?? 0}
                overtimeAction={setAttendanceOvertime.bind(null, businessId, e.id, date)}
                selfie={selfieByEmployee.get(e.id) ?? null}
                verifyAction={
                  selfieByEmployee.get(e.id)
                    ? verifyAttendance.bind(null, businessId, selfieByEmployee.get(e.id)!.attendanceId)
                    : undefined
                }
                deleteSelfieAction={
                  selfieByEmployee.get(e.id)
                    ? deleteAttendanceSelfie.bind(null, businessId, selfieByEmployee.get(e.id)!.attendanceId)
                    : undefined
                }
              />
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada karyawan aktif. Tambahkan dulu di halaman Karyawan.
            </p>
          )}
        </div>
    </div>
  );
}
