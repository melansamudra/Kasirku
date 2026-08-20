import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PillBadge } from "@/components/ui/pill-badge";
import { createPayslip } from "../actions";
import { calcPayslip, effectiveLemburRate } from "../calc";
import CreateSlipButton from "./create-slip-button";

const REPORT_TIMEZONE = "Asia/Jakarta";

function currentMonthStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE }).slice(0, 7);
}

function addMonthsStr(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastDayOfMonthStr(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default async function PayrollRekapPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { businessId } = await params;
  const { month: monthParam } = await searchParams;
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthStr();
  const monthStart = `${month}-01`;
  const monthEnd = lastDayOfMonthStr(month);

  const supabase = await createClient();

  const [{ data: business }, { data: employees }] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "name, izin_deduction_weekday, izin_deduction_weekend, late_deduction_per_occurrence, lembur_rate_per_hour",
      )
      .eq("id", businessId)
      .single(),
    supabase
      .from("employees")
      .select("id, name, salary_type, daily_rate, monthly_rate, lembur_rate_per_hour, active")
      .eq("business_id", businessId)
      .order("name", { ascending: true }),
  ]);

  if (!business) {
    notFound();
  }

  const [{ data: attendanceRows }, { data: existingSlips }] = await Promise.all([
    supabase
      .from("attendance")
      .select("employee_id, date, status, late, overtime_hours")
      .eq("business_id", businessId)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    supabase
      .from("payslips")
      .select("id, employee_id")
      .eq("business_id", businessId)
      .eq("period_start", monthStart)
      .eq("period_end", monthEnd),
  ]);

  const attendanceByEmployee = new Map<string, { date: string; status: string; late: boolean }[]>();
  const overtimeByEmployee = new Map<string, number>();
  for (const r of attendanceRows ?? []) {
    const list = attendanceByEmployee.get(r.employee_id) ?? [];
    list.push({ date: r.date, status: r.status, late: r.late });
    attendanceByEmployee.set(r.employee_id, list);
    overtimeByEmployee.set(
      r.employee_id,
      (overtimeByEmployee.get(r.employee_id) ?? 0) + Number(r.overtime_hours),
    );
  }

  const existingSlipByEmployee = new Map((existingSlips ?? []).map((s) => [s.employee_id, s.id]));

  const settings = {
    izinDeductionWeekday: Number(business.izin_deduction_weekday),
    izinDeductionWeekend: Number(business.izin_deduction_weekend),
    lateDeductionPerOccurrence: Number(business.late_deduction_per_occurrence),
  };

  const rows = (employees ?? []).map((e) => {
    const calc = calcPayslip(
      monthStart,
      monthEnd,
      attendanceByEmployee.get(e.id) ?? [],
      {
        salaryType: e.salary_type === "bulanan" ? "bulanan" : "harian",
        dailyRate: Number(e.daily_rate),
        monthlyRate: Number(e.monthly_rate),
      },
      settings,
    );
    return { employee: e, calc, existingSlipId: existingSlipByEmployee.get(e.id) ?? null };
  });

  const totalEstimasi = rows.reduce((s, r) => s + r.calc.estimatedTotal, 0);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Rekap Payroll — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Estimasi gaji semua karyawan untuk periode ini, dihitung langsung dari data Absensi —
        belum jadi slip beneran sampai Anda klik &quot;Buat Slip&quot;.
      </p>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
        <Link
          href={`/business/${businessId}/payroll/rekap?month=${addMonthsStr(month, -1)}`}
          className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
        >
          ←
        </Link>
        <div className="text-center">
          <p className="text-xs font-semibold text-zinc-900">{monthLabel(month)}</p>
          {month !== currentMonthStr() && (
            <Link
              href={`/business/${businessId}/payroll/rekap`}
              className="text-[11px] font-medium text-brand-600 hover:underline"
            >
              Kembali ke bulan ini
            </Link>
          )}
        </div>
        <Link
          href={`/business/${businessId}/payroll/rekap?month=${addMonthsStr(month, 1)}`}
          className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
        >
          →
        </Link>
      </div>

      <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-[10.5px] font-semibold uppercase text-brand-700">
          Total Estimasi Gaji {monthLabel(month)}
        </p>
        <p className="mt-1 text-xl font-bold text-brand-700">{formatRupiah(totalEstimasi)}</p>
        <p className="mt-1 text-[11px] text-brand-600">
          Belum termasuk lembur/THR/tunjangan/kasbon — itu ditambahkan per slip setelah dibuat.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {rows.length > 0 ? (
          rows.map(({ employee: e, calc, existingSlipId }) => (
            <div key={e.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {e.name}
                    {!e.active && (
                      <span className="ml-1.5 align-middle">
                        <PillBadge tone="zinc">Nonaktif</PillBadge>
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {e.salary_type === "bulanan" ? "Bulanan" : "Harian"} · {calc.hadirCount} hadir ·{" "}
                    {calc.izinCount} izin · {calc.sakitCount} sakit · {calc.alpaCount} alpa ·{" "}
                    {calc.offCount} off
                    {calc.lateCount > 0 && <> · {calc.lateCount}x terlambat</>}
                  </p>
                  {(calc.izinDeduction > 0 || calc.lateDeduction > 0) && (
                    <p className="mt-0.5 text-[11px] text-red-500">
                      {calc.izinDeduction > 0 && <>− Potongan izin {formatRupiah(calc.izinDeduction)} </>}
                      {calc.lateDeduction > 0 && <>− Potongan telat {formatRupiah(calc.lateDeduction)}</>}
                    </p>
                  )}
                  {(overtimeByEmployee.get(e.id) ?? 0) > 0 && (
                    <p className="mt-0.5 text-[11px] text-brand-600">
                      ⏰ {overtimeByEmployee.get(e.id)} jam lembur terdeteksi dari absen selfie
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-zinc-900">{formatRupiah(calc.estimatedTotal)}</p>
                  <p className="text-[10px] text-zinc-400">estimasi gaji pokok</p>
                </div>
              </div>
              <div className="mt-2 border-t border-zinc-100 pt-2 text-right">
                {existingSlipId ? (
                  <Link
                    href={`/business/${businessId}/payroll/${existingSlipId}`}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    ✓ Slip sudah dibuat — Lihat →
                  </Link>
                ) : (
                  <CreateSlipButton
                    businessId={businessId}
                    lemburRate={effectiveLemburRate(
                      e.lembur_rate_per_hour === null ? null : Number(e.lembur_rate_per_hour),
                      Number(business.lembur_rate_per_hour),
                    )}
                    defaultHours={overtimeByEmployee.get(e.id) ?? 0}
                    action={createPayslip.bind(null, businessId, e.id, monthStart, monthEnd)}
                  />
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada karyawan. Tambahkan dulu di halaman Karyawan.
          </p>
        )}
      </div>
    </div>
  );
}
