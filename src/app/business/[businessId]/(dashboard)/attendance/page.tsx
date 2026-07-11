import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  // ── Rekap bulan berjalan (berdasarkan tanggal yang sedang dilihat) ──
  const monthStart = `${date.slice(0, 7)}-01`;
  const { data: monthRows } = await supabase
    .from("attendance")
    .select("employee_id, status")
    .eq("business_id", businessId)
    .gte("date", monthStart)
    .lte("date", date);

  const recap = new Map<string, Record<AttendanceStatus, number>>();
  for (const e of employees ?? []) {
    recap.set(e.id, { hadir: 0, izin: 0, sakit: 0, alpa: 0 });
  }
  for (const r of monthRows ?? []) {
    const entry = recap.get(r.employee_id);
    if (entry) entry[r.status as AttendanceStatus] += 1;
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
          <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-bold text-zinc-900">Rekap Bulan Ini</h2>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {monthStart.slice(0, 7)} sampai {date}
              </p>
            </div>
            <div className="divide-y divide-zinc-100">
              {employees.map((e) => {
                const r = recap.get(e.id)!;
                return (
                  <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-medium text-zinc-700">{e.name}</span>
                    <span className="text-[11px] text-zinc-500">
                      <span className="text-brand-700">{r.hadir} hadir</span> ·{" "}
                      <span className="text-amber-600">{r.izin} izin</span> ·{" "}
                      <span className="text-blue-600">{r.sakit} sakit</span> ·{" "}
                      <span className="text-red-600">{r.alpa} alpa</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
}
