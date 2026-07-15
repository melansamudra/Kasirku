import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Clock, Thermometer, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import { setAttendance, type AttendanceStatus } from "./actions";
import AttendanceRow from "./attendance-row";

const REPORT_TIMEZONE = "Asia/Jakarta";

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE });
}

function addDaysStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("employee_id, status")
    .eq("business_id", businessId)
    .eq("date", date);

  const statusByEmployee = new Map(
    (attendanceRows ?? []).map((r) => [r.employee_id, r.status as AttendanceStatus]),
  );

  const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  for (const status of statusByEmployee.values()) {
    counts[status] += 1;
  }

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Absensi — {business.name}</h1>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
          <Link
            href={`/business/${businessId}/attendance?date=${addDaysStr(date, -1)}`}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            ←
          </Link>
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-900">{formatDateLabel(date)}</p>
            {date !== todayStr() && (
              <Link
                href={`/business/${businessId}/attendance`}
                className="text-[11px] font-medium text-brand-600 hover:underline"
              >
                Kembali ke hari ini
              </Link>
            )}
          </div>
          <Link
            href={`/business/${businessId}/attendance?date=${addDaysStr(date, 1)}`}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            →
          </Link>
        </div>

        {employees && employees.length > 0 && (
          <div className="mt-4 grid grid-cols-4 gap-2.5">
            <StatCard label="Hadir" value={String(counts.hadir)} icon={CalendarCheck} tone="brand" />
            <StatCard label="Izin" value={String(counts.izin)} icon={Clock} tone="amber" />
            <StatCard label="Sakit" value={String(counts.sakit)} icon={Thermometer} tone="blue" />
            <StatCard label="Alpa" value={String(counts.alpa)} icon={UserX} tone="red" />
          </div>
        )}

        <div className="mt-4 space-y-2">
          {employees && employees.length > 0 ? (
            employees.map((e) => (
              <AttendanceRow
                key={e.id}
                employeeName={e.name}
                currentStatus={statusByEmployee.get(e.id) ?? null}
                action={setAttendance.bind(null, businessId, e.id, date)}
              />
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada karyawan aktif. Tambahkan dulu di halaman Karyawan.
            </p>
          )}
        </div>

        {employees && employees.length > 0 && (
          <Link
            href={`/business/${businessId}/attendance/rekap`}
            className="mt-6 flex items-center justify-between rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
          >
            Lihat Rekap Bulanan
            <span className="text-brand-600">→</span>
          </Link>
        )}
    </div>
  );
}
