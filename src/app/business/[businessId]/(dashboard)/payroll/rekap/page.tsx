import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PillBadge } from "@/components/ui/pill-badge";
import { createPayslip } from "../actions";
import { calcPayslip, effectiveLemburRate } from "../calc";
import CreateSlipButton from "./create-slip-button";
import PrintRekapButton from "./print-rekap-button";

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

// Judul tab/dokumen saat cetak -- sama pola dengan slip absensi & slip
// payroll individual (ganti "CreateImpact" default dari root layout).
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ month?: string }>;
}): Promise<Metadata> {
  const { businessId } = await params;
  const { month: monthParam } = await searchParams;
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthStr();
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).maybeSingle();

  const title = business ? `Rekap Payroll ${monthLabel(month)} - ${business.name}` : "Rekap Payroll";
  return { title };
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

  const [{ data: business }, { data: employees }, { data: lateTierRows }] = await Promise.all([
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
    supabase.from("late_deduction_tiers").select("threshold_minutes, amount").eq("business_id", businessId),
  ]);

  if (!business) {
    notFound();
  }

  const [{ data: attendanceRows }, { data: existingSlips }] = await Promise.all([
    supabase
      .from("attendance")
      .select("employee_id, date, status, late, late_minutes, overtime_hours")
      .eq("business_id", businessId)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    supabase
      .from("payslips")
      .select(
        "id, employee_id, base_pay, izin_deduction, late_deduction, lembur_amount, thr_amount, kasbon_deduction, payslip_adjustments(type, amount)",
      )
      .eq("business_id", businessId)
      .eq("period_start", monthStart)
      .eq("period_end", monthEnd),
  ]);

  const attendanceByEmployee = new Map<
    string,
    { date: string; status: string; late: boolean; lateMinutes: number }[]
  >();
  const overtimeByEmployee = new Map<string, number>();
  for (const r of attendanceRows ?? []) {
    const list = attendanceByEmployee.get(r.employee_id) ?? [];
    list.push({ date: r.date, status: r.status, late: r.late, lateMinutes: r.late_minutes });
    attendanceByEmployee.set(r.employee_id, list);
    overtimeByEmployee.set(
      r.employee_id,
      (overtimeByEmployee.get(r.employee_id) ?? 0) + Number(r.overtime_hours),
    );
  }

  const existingSlipByEmployee = new Map((existingSlips ?? []).map((s) => [s.employee_id, s.id]));

  // Slip yang sudah dibuat punya angka final (lembur/THR/insentif/kasbon
  // sudah dilengkapi admin) -- dipakai gantiin estimasi kasar dari calcPayslip
  // di tabel/PDF supaya rekap yang dilaporkan ke owner akurat, bukan cuma
  // gaji pokok + potongan izin/telat kayak sebelum slip dibuat.
  const finalByEmployee = new Map(
    (existingSlips ?? []).map((s) => {
      const adjustments = (s.payslip_adjustments ?? []) as { type: string; amount: number }[];
      const tunjanganTotal = adjustments
        .filter((a) => a.type === "tunjangan")
        .reduce((sum, a) => sum + Number(a.amount), 0);
      const potonganLainTotal = adjustments
        .filter((a) => a.type === "potongan")
        .reduce((sum, a) => sum + Number(a.amount), 0);
      const lemburAmount = Number(s.lembur_amount);
      const thrAmount = Number(s.thr_amount);
      const kasbonDeduction = Number(s.kasbon_deduction);
      const izinDeduction = Number(s.izin_deduction);
      const lateDeduction = Number(s.late_deduction);
      const totalDiterima =
        Number(s.base_pay) +
        lemburAmount +
        thrAmount +
        tunjanganTotal -
        potonganLainTotal -
        izinDeduction -
        lateDeduction -
        kasbonDeduction;
      return [
        s.employee_id,
        { izinDeduction, lateDeduction, lemburAmount, thrAmount, tunjanganTotal, potonganLainTotal, kasbonDeduction, totalDiterima },
      ];
    }),
  );

  const settings = {
    izinDeductionWeekday: Number(business.izin_deduction_weekday),
    izinDeductionWeekend: Number(business.izin_deduction_weekend),
    lateDeductionPerOccurrence: Number(business.late_deduction_per_occurrence),
    lateTiers: (lateTierRows ?? []).map((t) => ({
      thresholdMinutes: t.threshold_minutes,
      amount: Number(t.amount),
    })),
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
    return {
      employee: e,
      calc,
      existingSlipId: existingSlipByEmployee.get(e.id) ?? null,
      final: finalByEmployee.get(e.id) ?? null,
    };
  });

  const totalEstimasi = rows.reduce((s, r) => s + (r.final?.totalDiterima ?? r.calc.estimatedTotal), 0);

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Rekap Payroll — {business.name}</h1>
          <p className="mt-1 text-sm text-zinc-500 print:hidden">
            Estimasi gaji semua karyawan untuk periode ini, dihitung langsung dari data Absensi —
            belum jadi slip beneran sampai Anda klik &quot;Buat Slip&quot;.
          </p>
          <p className="mt-0.5 hidden text-sm text-zinc-500 print:block">{monthLabel(month)}</p>
        </div>
        <div className="shrink-0 print:hidden">
          <PrintRekapButton />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 print:hidden">
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

      <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 print:hidden">
        <p className="text-[10.5px] font-semibold uppercase text-brand-700">
          Total Gaji {monthLabel(month)}
        </p>
        <p className="mt-1 text-xl font-bold text-brand-700">{formatRupiah(totalEstimasi)}</p>
        <p className="mt-1 text-[11px] text-brand-600">
          Karyawan yang slip-nya sudah dibuat: angka final (termasuk lembur/THR/insentif/kasbon).
          Yang belum: estimasi kasar dari absensi saja.
        </p>
      </div>

      {/* Tabel ringkas khusus cetak/PDF -- versi polos tanpa tombol, cuma
          muncul saat print (lihat print:hidden di daftar interaktif di
          bawah), satu halaman berisi semua karyawan sekaligus buat dilaporkan
          ke owner. */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-zinc-200 print:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[10px] uppercase text-zinc-500">
              <th className="px-2.5 py-1.5">Nama</th>
              <th className="px-2.5 py-1.5">Tipe</th>
              <th className="px-2.5 py-1.5 text-center">Hadir</th>
              <th className="px-2.5 py-1.5 text-center">Izin</th>
              <th className="px-2.5 py-1.5 text-center">Sakit</th>
              <th className="px-2.5 py-1.5 text-center">Alpa</th>
              <th className="px-2.5 py-1.5 text-center">Off</th>
              <th className="px-2.5 py-1.5 text-center">Telat</th>
              <th className="px-2.5 py-1.5 text-right">Pot. Izin</th>
              <th className="px-2.5 py-1.5 text-right">Pot. Telat</th>
              <th className="px-2.5 py-1.5 text-right">+Lembur/Insentif</th>
              <th className="px-2.5 py-1.5 text-right">Pot. Kasbon</th>
              <th className="px-2.5 py-1.5 text-right">Total Gaji</th>
              <th className="px-2.5 py-1.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ employee: e, calc, final }) => {
              const izinDeduction = final?.izinDeduction ?? calc.izinDeduction;
              const lateDeduction = final?.lateDeduction ?? calc.lateDeduction;
              const extras = final ? final.lemburAmount + final.thrAmount + final.tunjanganTotal - final.potonganLainTotal : 0;
              const kasbonDeduction = final?.kasbonDeduction ?? 0;
              const total = final?.totalDiterima ?? calc.estimatedTotal;
              return (
                <tr key={e.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-2.5 py-1">
                    {e.name}
                    {!e.active && " (nonaktif)"}
                  </td>
                  <td className="px-2.5 py-1">{e.salary_type === "bulanan" ? "Bulanan" : "Harian"}</td>
                  <td className="px-2.5 py-1 text-center">{calc.hadirCount}</td>
                  <td className="px-2.5 py-1 text-center">{calc.izinCount}</td>
                  <td className="px-2.5 py-1 text-center">{calc.sakitCount}</td>
                  <td className="px-2.5 py-1 text-center">{calc.alpaCount}</td>
                  <td className="px-2.5 py-1 text-center">{calc.offCount}</td>
                  <td className="px-2.5 py-1 text-center">{calc.lateCount}x</td>
                  <td className="px-2.5 py-1 text-right">{formatRupiah(izinDeduction)}</td>
                  <td className="px-2.5 py-1 text-right">{formatRupiah(lateDeduction)}</td>
                  <td className="px-2.5 py-1 text-right">{extras > 0 ? formatRupiah(extras) : "-"}</td>
                  <td className="px-2.5 py-1 text-right">{kasbonDeduction > 0 ? formatRupiah(kasbonDeduction) : "-"}</td>
                  <td className="px-2.5 py-1 text-right font-semibold">{formatRupiah(total)}</td>
                  <td className="px-2.5 py-1 text-center">{final ? "Final" : "Estimasi"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
              <td className="px-2.5 py-1.5" colSpan={12}>
                Total Gaji {monthLabel(month)}
              </td>
              <td className="px-2.5 py-1.5 text-right">{formatRupiah(totalEstimasi)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <p className="border-t border-zinc-200 px-2.5 py-2 text-[10px] text-zinc-500">
          Status &quot;Final&quot;: slip sudah dibuat & lengkap (lembur/THR/insentif/kasbon sudah
          masuk). Status &quot;Estimasi&quot;: slip belum dibuat, angka cuma dari data absensi.
        </p>
      </div>

      <div className="mt-4 space-y-2 print:hidden">
        {rows.length > 0 ? (
          rows.map(({ employee: e, calc, existingSlipId, final }) => (
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
                  {final && (final.lemburAmount + final.thrAmount + final.tunjanganTotal > 0 || final.kasbonDeduction > 0) && (
                    <p className="mt-0.5 text-[11px] text-brand-600">
                      {final.lemburAmount + final.thrAmount + final.tunjanganTotal > 0 && (
                        <>+ Lembur/THR/insentif {formatRupiah(final.lemburAmount + final.thrAmount + final.tunjanganTotal)} </>
                      )}
                      {final.kasbonDeduction > 0 && <>− Potongan kasbon {formatRupiah(final.kasbonDeduction)}</>}
                    </p>
                  )}
                  {!final && (overtimeByEmployee.get(e.id) ?? 0) > 0 && (
                    <p className="mt-0.5 text-[11px] text-brand-600">
                      ⏰ {overtimeByEmployee.get(e.id)} jam lembur terdeteksi dari absen selfie
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-zinc-900">
                    {formatRupiah(final?.totalDiterima ?? calc.estimatedTotal)}
                  </p>
                  <p className="text-[10px] text-zinc-400">{final ? "total diterima (final)" : "estimasi gaji pokok"}</p>
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
