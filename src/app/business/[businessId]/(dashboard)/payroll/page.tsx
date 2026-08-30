import Link from "next/link";
import { notFound } from "next/navigation";
import { Users, Wallet, ClipboardCheck, HandCoins } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { PillBadge } from "@/components/ui/pill-badge";
import {
  createPayslip,
  updatePayrollDeductions,
  addLateTier,
  deleteLateTier,
} from "./actions";
import CreatePayslipForm from "./create-payslip-form";
import DeletePayslipButton from "./delete-payslip-button";
import PayrollDeductionsForm from "./payroll-deductions-form";
import AddLateTierForm from "./add-late-tier-form";
import DeleteLateTierButton from "./delete-late-tier-button";
import PayrollHolidaysSection from "./payroll-holidays-section";
import { payslipTotal } from "@/lib/payroll/payslip-total";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function toWibMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).slice(0, 7);
}

function addMonthsStr(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type PayslipAgg = {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  base_pay: number;
  meal_allowance: number;
  attendance_allowance: number;
  lembur_amount: number;
  thr_amount: number;
  izin_deduction: number;
  izin_weekend_penalty: number;
  late_deduction: number;
  kasbon_deduction: number;
  personal_loan_deduction: number;
  hadir_count: number;
  created_at: string;
  paid_at: string | null;
  employees: { name: string } | null;
  payslip_adjustments: { type: string; amount: number }[];
};

export default async function PayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { businessId } = await params;
  const { month: monthParam } = await searchParams;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select(
      "id, name, izin_deduction_mode, izin_deduction_weekday, izin_deduction_weekend, late_deduction_per_occurrence, lembur_rate_per_hour",
    )
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: lateTiers } = await supabase
    .from("late_deduction_tiers")
    .select("id, threshold_minutes, amount")
    .eq("business_id", businessId)
    .order("threshold_minutes", { ascending: true });

  const { data: payrollHolidays } = await supabase
    .from("payroll_holidays")
    .select("id, holiday_date, label")
    .eq("business_id", businessId)
    .order("holiday_date", { ascending: true });

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, salary_type, daily_rate, monthly_rate, lembur_rate_per_hour, active")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  // Diambil penuh (bukan dibatasi 50) lewat fetchAllRows supaya rekap
  // per-karyawan & stat "Total Dibayarkan" akurat, bukan cuma dari 50 slip
  // terakhir — lihat lib/pagination.ts soal kenapa unbounded select() bahaya.
  const [allPayslips, advances] = await Promise.all([
    fetchAllRows<PayslipAgg>((from, to) =>
      supabase
        .from("payslips")
        .select(
          "id, employee_id, period_start, period_end, base_pay, meal_allowance, attendance_allowance, lembur_amount, thr_amount, izin_deduction, izin_weekend_penalty, late_deduction, kasbon_deduction, personal_loan_deduction, hadir_count, created_at, paid_at, employees(name), payslip_adjustments(type, amount)",
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    fetchAllRows<{ employee_id: string; amount: number }>((from, to) =>
      supabase
        .from("employee_advances")
        .select("employee_id, amount")
        .eq("business_id", businessId)
        .range(from, to),
    ),
  ]);

  const today = todayStr();
  const defaultStart = `${today.slice(0, 7)}-01`;

  const boundCreatePayslip = createPayslip.bind(null, businessId);

  const activeEmployeeCount = (employees ?? []).filter((e) => e.active).length;

  const currentMonth = today.slice(0, 7);
  const selectedMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth;
  const monthSlips = allPayslips.filter((p) => toWibMonth(p.period_start) === selectedMonth);
  const totalDibayarkan = allPayslips.filter((p) => p.paid_at).reduce((s, p) => s + payslipTotal(p), 0);
  const totalDibayarkanBulan = monthSlips
    .filter((p) => p.paid_at)
    .reduce((s, p) => s + payslipTotal(p), 0);
  const unpaidSlips = allPayslips.filter((p) => !p.paid_at);
  const belumDibayarCount = unpaidSlips.length;
  const totalBelumDibayar = unpaidSlips.reduce((s, p) => s + payslipTotal(p), 0);

  // Rekap per karyawan: total dibayarkan sepanjang waktu, slip terakhir,
  // dan sisa kasbon (diberikan dikurangi yang sudah dipotong di slip yang
  // sudah dibayar — sama seperti logika getOutstandingKasbon di actions.ts).
  const totalDibayarByEmployee = new Map<string, number>();
  const lastSlipByEmployee = new Map<string, string>();
  const kasbonSettledByEmployee = new Map<string, number>();
  for (const p of allPayslips) {
    if (p.paid_at) {
      totalDibayarByEmployee.set(
        p.employee_id,
        (totalDibayarByEmployee.get(p.employee_id) ?? 0) + payslipTotal(p),
      );
      kasbonSettledByEmployee.set(
        p.employee_id,
        (kasbonSettledByEmployee.get(p.employee_id) ?? 0) + Number(p.kasbon_deduction),
      );
    }
    const prevLast = lastSlipByEmployee.get(p.employee_id);
    if (!prevLast || p.created_at > prevLast) {
      lastSlipByEmployee.set(p.employee_id, p.created_at);
    }
  }
  const kasbonGivenByEmployee = new Map<string, number>();
  for (const a of advances) {
    kasbonGivenByEmployee.set(a.employee_id, (kasbonGivenByEmployee.get(a.employee_id) ?? 0) + Number(a.amount));
  }
  const totalKasbonBeredar = (employees ?? []).reduce((s, e) => {
    const given = kasbonGivenByEmployee.get(e.id) ?? 0;
    const settled = kasbonSettledByEmployee.get(e.id) ?? 0;
    return s + Math.max(0, given - settled);
  }, 0);

  const recentPayslips = monthSlips;

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Payroll — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Buat slip gaji dari data absensi, tambah tunjangan/potongan di halaman slip.
        </p>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
          <Link
            href={`/business/${businessId}/payroll?month=${addMonthsStr(selectedMonth, -1)}`}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            ←
          </Link>
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-900">{monthLabel(selectedMonth)}</p>
            {selectedMonth !== currentMonth && (
              <Link
                href={`/business/${businessId}/payroll`}
                className="text-[11px] font-medium text-brand-600 hover:underline"
              >
                Kembali ke bulan ini
              </Link>
            )}
          </div>
          <Link
            href={`/business/${businessId}/payroll?month=${addMonthsStr(selectedMonth, 1)}`}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            →
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Karyawan Aktif" value={String(activeEmployeeCount)} icon={Users} tone="zinc" />
          <StatCard
            label="Dibayarkan"
            value={formatRupiah(totalDibayarkanBulan)}
            sub={monthLabel(selectedMonth)}
            icon={Wallet}
            tone="brand"
          />
          <StatCard
            label="Belum Dibayar"
            value={formatRupiah(totalBelumDibayar)}
            sub={`${belumDibayarCount} slip gaji · semua waktu`}
            icon={ClipboardCheck}
            tone={belumDibayarCount > 0 ? "amber" : "brand"}
          />
          <StatCard
            label="Kasbon Beredar"
            value={formatRupiah(totalKasbonBeredar)}
            sub="saldo saat ini"
            icon={HandCoins}
            tone={totalKasbonBeredar > 0 ? "amber" : "brand"}
          />
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          Total dibayarkan sepanjang waktu (semua periode): {formatRupiah(totalDibayarkan)}
        </p>

        <Link
          href={`/business/${businessId}/payroll/rekap`}
          className="mt-4 flex items-center justify-between rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
        >
          Lihat Rekap Payroll Bulanan
          <span className="text-brand-600">→</span>
        </Link>

        <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Pengaturan Payroll</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Berlaku sama untuk semua karyawan — dipakai otomatis saat slip gaji dibuat dari data
            Absensi.
          </p>
          <div className="mt-4">
            <PayrollDeductionsForm
              action={updatePayrollDeductions.bind(null, businessId)}
              izinDeductionMode={business.izin_deduction_mode === "full_day" ? "full_day" : "flat"}
              izinDeductionWeekday={Number(business.izin_deduction_weekday)}
              izinDeductionWeekend={Number(business.izin_deduction_weekend)}
              lateDeductionPerOccurrence={Number(business.late_deduction_per_occurrence)}
              lemburRatePerHour={Number(business.lembur_rate_per_hour)}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Tingkatan Potongan Keterlambatan</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Opsional — kalau diisi, ini menggantikan &quot;Potongan per Kali Terlambat&quot; flat di
            atas. Potongan dihitung per hari dari menit telat hari itu, bukan lagi rata sama semua.
          </p>
          {lateTiers && lateTiers.length > 0 ? (
            <div className="mt-3 space-y-2">
              {lateTiers.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2"
                >
                  <p className="text-sm text-zinc-900">
                    Lebih dari <span className="font-semibold">{t.threshold_minutes} menit</span> ={" "}
                    <span className="font-semibold">{formatRupiah(Number(t.amount))}</span>
                  </p>
                  <DeleteLateTierButton action={deleteLateTier.bind(null, businessId, t.id)} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
              Belum ada tingkatan — pakai potongan flat di atas.
            </p>
          )}
          <div className="mt-3">
            <AddLateTierForm action={addLateTier.bind(null, businessId)} />
          </div>
        </div>

        <PayrollHolidaysSection businessId={businessId} holidays={payrollHolidays ?? []} />

        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Daftar Karyawan &amp; Rekap</h2>
          {employees && employees.length > 0 ? (
            employees.map((e) => {
              const rate =
                e.salary_type === "bulanan"
                  ? `${formatRupiah(Number(e.monthly_rate))}/bulan`
                  : `${formatRupiah(Number(e.daily_rate))}/hari`;
              const totalDibayar = totalDibayarByEmployee.get(e.id) ?? 0;
              const given = kasbonGivenByEmployee.get(e.id) ?? 0;
              const settled = kasbonSettledByEmployee.get(e.id) ?? 0;
              const outstanding = Math.max(0, given - settled);
              const lastSlip = lastSlipByEmployee.get(e.id);

              return (
                <div
                  key={e.id}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                        {e.salary_type === "bulanan" ? "Bulanan" : "Harian"} · {rate}
                      </p>
                    </div>
                    <Link
                      href={`/business/${businessId}/kas-kecil`}
                      className="shrink-0 text-xs font-medium text-amber-600 hover:underline"
                    >
                      + Kasbon (lewat Kas Kecil)
                    </Link>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>
                      Total dibayar: <span className="font-medium text-zinc-800">{formatRupiah(totalDibayar)}</span>
                    </span>
                    {outstanding > 0 && (
                      <span>
                        Sisa kasbon:{" "}
                        <span className="font-semibold text-amber-600">{formatRupiah(outstanding)}</span>
                      </span>
                    )}
                    {lastSlip && <span>Slip terakhir: {formatDate(lastSlip.slice(0, 10))}</span>}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada karyawan. Tambahkan dulu di halaman Karyawan.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Buat Slip Gaji</h2>
          <CreatePayslipForm
            businessId={businessId}
            employees={(employees ?? []).map((e) => ({
              id: e.id,
              name: e.name,
              salaryType: e.salary_type === "bulanan" ? "bulanan" : "harian",
              dailyRate: Number(e.daily_rate),
              monthlyRate: Number(e.monthly_rate),
              lemburRatePerHour: e.lembur_rate_per_hour === null ? null : Number(e.lembur_rate_per_hour),
              active: e.active,
            }))}
            businessLemburRate={Number(business.lembur_rate_per_hour)}
            defaultStart={defaultStart}
            defaultEnd={today}
            action={boundCreatePayslip}
          />
        </div>

        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">
            Riwayat Slip Gaji — {monthLabel(selectedMonth)}
          </h2>
          {recentPayslips.length > 0 ? (
            recentPayslips.map((p) => {
              const total = payslipTotal(p);
              const employeeName = p.employees?.name ?? "Karyawan terhapus";

              return (
                <Link
                  key={p.id}
                  href={`/business/${businessId}/payroll/${p.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-brand-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900">{employeeName}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-900">
                        {formatRupiah(total)}
                      </span>
                      <DeletePayslipButton businessId={businessId} payslipId={p.id} />
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <p className="text-xs text-zinc-500">
                      {formatDate(p.period_start)} – {formatDate(p.period_end)} · {p.hadir_count} hari
                      kerja
                    </p>
                    {p.paid_at && <PillBadge tone="green">✓ Dibayar</PillBadge>}
                  </div>
                </Link>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada slip gaji untuk periode {monthLabel(selectedMonth)}.
            </p>
          )}
        </div>
    </div>
  );
}
