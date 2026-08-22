import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const [
    { data: employee },
    { data: business },
    { data: lateTierRows },
    { data: advancesThisMonth },
    { data: allAdvances },
    { data: paidSlips },
  ] = await Promise.all([
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
    supabase
      .from("employee_advances")
      .select("amount")
      .eq("business_id", businessId)
      .eq("employee_id", employeeId)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    // Sisa kasbon dihitung sama seperti getOutstandingKasbon di
    // payroll/actions.ts (total diberikan - total sudah kepotong dari slip
    // yang sudah dibayar) — dihitung ulang di sini karena fungsi itu tidak
    // di-export, supaya angkanya tetap konsisten dengan Payroll.
    supabase
      .from("employee_advances")
      .select("amount")
      .eq("business_id", businessId)
      .eq("employee_id", employeeId),
    supabase
      .from("payslips")
      .select("kasbon_deduction")
      .eq("business_id", businessId)
      .eq("employee_id", employeeId)
      .not("paid_at", "is", null),
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

  const kasbonThisMonth = (advancesThisMonth ?? []).reduce((s, a) => s + Number(a.amount), 0);
  const kasbonGivenAll = (allAdvances ?? []).reduce((s, a) => s + Number(a.amount), 0);
  const kasbonSettledAll = (paidSlips ?? []).reduce((s, p) => s + Number(p.kasbon_deduction), 0);
  const kasbonOutstanding = Math.max(0, kasbonGivenAll - kasbonSettledAll);

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

      <div className="mt-3 grid grid-cols-5 gap-1.5 print:mt-2 print:gap-1">
        {[
          { label: "Hadir", value: counts.hadir, tone: "border-brand-200 bg-brand-50 text-brand-700" },
          { label: "Izin", value: counts.izin, tone: "border-amber-200 bg-amber-50 text-amber-700" },
          { label: "Sakit", value: counts.sakit, tone: "border-blue-200 bg-blue-50 text-blue-700" },
          { label: "Alpa", value: counts.alpa, tone: "border-red-200 bg-red-50 text-red-700" },
          { label: "Off", value: counts.off, tone: "border-zinc-200 bg-zinc-100 text-zinc-600" },
        ].map((c) => (
          <div
            key={c.label}
            className={`rounded-lg border px-1.5 py-1 text-center print:rounded print:py-0.5 ${c.tone}`}
          >
            <p className="text-[8.5px] font-semibold uppercase">{c.label}</p>
            <p className="text-sm font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {lateCount > 0 && (
        <p className="mt-1.5 text-xs font-medium text-amber-600 print:mt-1">
          ⏰ {lateCount} kali tercatat terlambat bulan ini
        </p>
      )}

      <div className="mt-2 grid grid-cols-3 gap-1.5 print:mt-1.5 print:gap-1">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 print:py-0.5">
          <p className="text-[8.5px] font-semibold uppercase text-zinc-500">Total Jam Kerja</p>
          <p className="text-sm font-bold text-zinc-800">{formatJam(totalJamKerja)}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 print:py-0.5">
          <p className="text-[8.5px] font-semibold uppercase text-red-600">Potongan (Izin+Telat)</p>
          <p className="text-sm font-bold text-red-600">{formatRupiah(totalPotongan)}</p>
        </div>
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 print:py-0.5">
          <p className="text-[8.5px] font-semibold uppercase text-violet-700">Kasbon Bulan Ini</p>
          <p className="text-sm font-bold text-violet-700">{formatRupiah(kasbonThisMonth)}</p>
          {kasbonOutstanding > 0 && (
            <p className="text-[8.5px] text-violet-600">Sisa: {formatRupiah(kasbonOutstanding)}</p>
          )}
        </div>
      </div>

      {/* Ringkasan cetak per-hari -- versi polos tanpa tombol, hanya muncul
          saat print (lihat print:hidden di daftar interaktif di bawah). */}
      <div className="mt-3 hidden overflow-hidden rounded-xl border border-zinc-200 print:mt-2 print:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[10px] uppercase text-zinc-500">
              <th className="px-2 py-1 print:py-0.5">Tanggal</th>
              <th className="px-2 py-1 print:py-0.5">Status</th>
              <th className="px-2 py-1 print:py-0.5">Masuk</th>
              <th className="px-2 py-1 print:py-0.5">Pulang</th>
              <th className="px-2 py-1 print:py-0.5 text-right">Jam Kerja</th>
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
                  <td className="px-2 py-0.5 print:py-px">{formatDayLabel(dateStr)}</td>
                  <td className="px-2 py-0.5 print:py-px capitalize">{row?.status ?? "—"}</td>
                  <td className="px-2 py-0.5 print:py-px">{row?.check_in_at ? formatTime(row.check_in_at) : "—"}</td>
                  <td className="px-2 py-0.5 print:py-px">{row?.check_out_at ? formatTime(row.check_out_at) : "—"}</td>
                  <td className="px-2 py-0.5 print:py-px text-right">{durasi !== null ? formatJam(durasi) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-zinc-200 px-2 py-2 text-xs">
          <p>Total Jam Kerja: <span className="font-semibold">{formatJam(totalJamKerja)}</span></p>
          <p>Terlambat: <span className="font-semibold">{lateCount} kali</span> (potongan {formatRupiah(calc.lateDeduction)})</p>
          <p>Potongan Izin: <span className="font-semibold">{formatRupiah(calc.izinDeduction)}</span></p>
          <p className="font-semibold">Total Potongan: {formatRupiah(totalPotongan)}</p>
          <p className="mt-1">Kasbon Bulan Ini: <span className="font-semibold">{formatRupiah(kasbonThisMonth)}</span></p>
          {kasbonOutstanding > 0 && (
            <p>Sisa Kasbon Belum Terpotong: <span className="font-semibold">{formatRupiah(kasbonOutstanding)}</span></p>
          )}
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
