import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import { CalendarCheck, Clock, Thermometer, UserX, CalendarOff } from "lucide-react";
import { setAttendance, setAttendanceLate, setAttendanceTime, type AttendanceStatus } from "../../actions";
import AttendanceRow from "../../attendance-row";
import { calcPayslip } from "../../../payroll/calc";
import PrintSlipButton from "./print-slip-button";

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatJam(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}j ${m}m` : `${h}j`;
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

  const [{ data: employee }, { data: business }, { data: lateTierRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name, salary_type, daily_rate, monthly_rate")
      .eq("id", employeeId)
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("izin_deduction_weekday, izin_deduction_weekend, late_deduction_per_occurrence")
      .eq("id", businessId)
      .single(),
    supabase
      .from("late_deduction_tiers")
      .select("threshold_minutes, amount")
      .eq("business_id", businessId),
  ]);

  if (!employee || !business) {
    notFound();
  }

  const { data: rows } = await supabase
    .from("attendance")
    .select("date, status, late, late_minutes, check_in_at, check_out_at")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .gte("date", monthStart)
    .lte("date", monthEnd);

  const byDate = new Map((rows ?? []).map((r) => [r.date, r]));

  const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, off: 0 };
  let lateCount = 0;
  let totalJamKerja = 0;
  for (const r of rows ?? []) {
    counts[r.status as keyof typeof counts] += 1;
    if (r.late) lateCount += 1;
    if (r.check_in_at && r.check_out_at) {
      totalJamKerja += (new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 3600000;
    }
  }

  const calc = calcPayslip(
    monthStart,
    monthEnd,
    (rows ?? []).map((r) => ({ ...r, lateMinutes: r.late_minutes })),
    {
      salaryType: employee.salary_type === "bulanan" ? "bulanan" : "harian",
      dailyRate: Number(employee.daily_rate),
      monthlyRate: Number(employee.monthly_rate),
    },
    {
      izinDeductionWeekday: Number(business.izin_deduction_weekday),
      izinDeductionWeekend: Number(business.izin_deduction_weekend),
      lateDeductionPerOccurrence: Number(business.late_deduction_per_occurrence),
      lateTiers: (lateTierRows ?? []).map((t) => ({
        thresholdMinutes: t.threshold_minutes,
        amount: Number(t.amount),
      })),
    },
  );

  const totalPotongan = calc.izinDeduction + calc.lateDeduction;

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link
          href={`/business/${businessId}/attendance/rekap?month=${month}`}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          ← Kembali ke Rekap {monthLabel(month)}
        </Link>
        <PrintSlipButton />
      </div>

      <h1 className="mt-2 text-lg font-bold text-zinc-900">{employee.name}</h1>
      <p className="mt-0.5 text-sm text-zinc-500 print:hidden">
        Absensi {monthLabel(month)} — klik status untuk mengubah
      </p>
      <p className="mt-0.5 hidden text-sm text-zinc-500 print:block">Slip Absensi {monthLabel(month)}</p>

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

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-500">Total Jam Kerja</p>
          <p className="text-base font-bold text-zinc-800">{formatJam(totalJamKerja)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-red-600">Potongan (Izin + Telat)</p>
          <p className="text-base font-bold text-red-600">{formatRupiah(totalPotongan)}</p>
        </div>
      </div>

      {/* Ringkasan cetak per-hari -- versi polos tanpa tombol, hanya muncul
          saat print (lihat print:hidden di daftar interaktif di bawah). */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-zinc-200 print:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[10px] uppercase text-zinc-500">
              <th className="px-2 py-1.5">Tanggal</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Masuk</th>
              <th className="px-2 py-1.5">Pulang</th>
              <th className="px-2 py-1.5 text-right">Jam Kerja</th>
            </tr>
          </thead>
          <tbody>
            {daysInMonth(month).map((dateStr) => {
              const row = byDate.get(dateStr);
              const durasi =
                row?.check_in_at && row?.check_out_at
                  ? (new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 3600000
                  : null;
              return (
                <tr key={dateStr} className="border-b border-zinc-100 last:border-0">
                  <td className="px-2 py-1">{formatDayLabel(dateStr)}</td>
                  <td className="px-2 py-1 capitalize">{row?.status ?? "—"}</td>
                  <td className="px-2 py-1">{row?.check_in_at ? formatTime(row.check_in_at) : "—"}</td>
                  <td className="px-2 py-1">{row?.check_out_at ? formatTime(row.check_out_at) : "—"}</td>
                  <td className="px-2 py-1 text-right">{durasi !== null ? formatJam(durasi) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-zinc-200 px-2 py-2 text-xs">
          <p>Total Jam Kerja: <span className="font-semibold">{formatJam(totalJamKerja)}</span></p>
          <p>Terlambat: <span className="font-semibold">{lateCount} kali</span> (potongan {formatRupiah(calc.lateDeduction)})</p>
          <p>Potongan Izin: <span className="font-semibold">{formatRupiah(calc.izinDeduction)}</span></p>
          <p className="mt-1 font-semibold">Total Potongan: {formatRupiah(totalPotongan)}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2 print:hidden">
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
              timeAction={setAttendanceTime.bind(null, businessId, employeeId, dateStr)}
              selfie={
                row?.check_in_at || row?.check_out_at
                  ? {
                      attendanceId: "",
                      checkInAt: row?.check_in_at ?? null,
                      checkInPhotoUrl: null,
                      checkInLat: null,
                      checkInLng: null,
                      checkOutAt: row?.check_out_at ?? null,
                      checkOutPhotoUrl: null,
                      checkOutLat: null,
                      checkOutLng: null,
                      lateMinutes: 0,
                      overtimeHours: 0,
                      verified: false,
                    }
                  : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}
