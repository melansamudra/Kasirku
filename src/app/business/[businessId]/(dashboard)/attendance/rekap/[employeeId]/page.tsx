import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import { CalendarCheck, Clock, Thermometer, UserX, CalendarOff } from "lucide-react";
import { setAttendance, setAttendanceLate, type AttendanceStatus } from "../../actions";
import AttendanceRow from "../../attendance-row";

const REPORT_TIMEZONE = "Asia/Jakarta";

function currentMonthStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE }).slice(0, 7);
}

function lastDayOfMonthStr(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default async function EmployeeAttendanceRekapPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; employeeId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { businessId, employeeId } = await params;
  const { month: monthParam } = await searchParams;
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthStr();
  const monthStart = `${month}-01`;
  const monthEnd = lastDayOfMonthStr(month);

  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name")
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!employee) {
    notFound();
  }

  const { data: rows } = await supabase
    .from("attendance")
    .select("date, status, late")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .gte("date", monthStart)
    .lte("date", monthEnd);

  const byDate = new Map((rows ?? []).map((r) => [r.date, r]));

  const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, off: 0 };
  let lateCount = 0;
  for (const r of rows ?? []) {
    counts[r.status as keyof typeof counts] += 1;
    if (r.late) lateCount += 1;
  }

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/attendance/rekap?month=${month}`}
        className="text-xs font-medium text-brand-600 hover:underline"
      >
        ← Kembali ke Rekap {monthLabel(month)}
      </Link>

      <h1 className="mt-2 text-lg font-bold text-zinc-900">{employee.name}</h1>
      <p className="mt-0.5 text-sm text-zinc-500">Absensi {monthLabel(month)} — klik status untuk mengubah</p>

      <div className="mt-4 grid grid-cols-5 gap-2">
        <StatCard label="Hadir" value={String(counts.hadir)} icon={CalendarCheck} tone="brand" />
        <StatCard label="Izin" value={String(counts.izin)} icon={Clock} tone="amber" />
        <StatCard label="Sakit" value={String(counts.sakit)} icon={Thermometer} tone="blue" />
        <StatCard label="Alpa" value={String(counts.alpa)} icon={UserX} tone="red" />
        <StatCard label="Off" value={String(counts.off)} icon={CalendarOff} tone="zinc" />
      </div>

      {lateCount > 0 && (
        <p className="mt-2 text-xs font-medium text-amber-600">
          ⏰ {lateCount} kali tercatat terlambat bulan ini
        </p>
      )}

      <div className="mt-4 space-y-2">
        {daysInMonth(month).map((dateStr) => {
          const row = byDate.get(dateStr);
          return (
            <AttendanceRow
              key={dateStr}
              employeeName={formatDayLabel(dateStr)}
              currentStatus={(row?.status as AttendanceStatus) ?? null}
              late={row?.late ?? false}
              action={setAttendance.bind(null, businessId, employeeId, dateStr)}
              lateAction={setAttendanceLate.bind(null, businessId, employeeId, dateStr)}
            />
          );
        })}
      </div>
    </div>
  );
}
