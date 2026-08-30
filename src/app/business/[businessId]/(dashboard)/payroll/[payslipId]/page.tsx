import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addPayslipAdjustment,
  markPayslipPaid,
  updatePayslipExtras,
  updateKasbonDeduction,
  updatePersonalLoanDeduction,
} from "../actions";
import AddAdjustmentForm from "./add-adjustment-form";
import DeleteAdjustmentButton from "./delete-adjustment-button";
import LemburThrForm from "./lembur-thr-form";
import DeductionsForm from "./deductions-form";
import PersonalLoanDeductionForm from "./personal-loan-deduction-form";
import MarkPaidButton from "./mark-paid-button";
import PrintButton from "./print-button";

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

export default async function PayslipDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; payslipId: string }>;
}) {
  const { businessId, payslipId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();

  const { data: payslip } = await supabase
    .from("payslips")
    .select(
      "id, employee_id, period_start, period_end, salary_type, daily_rate, monthly_rate, hadir_count, izin_count, sakit_count, alpa_count, off_count, izin_noted_count, izin_unnoted_count, izin_unnoted_weekend_count, izin_deduction, izin_weekend_penalty, late_count, late_deduction, hari_kerja_efektif, base_pay, meal_allowance, attendance_allowance, lembur_amount, lembur_hours, lembur_rate, thr_amount, kasbon_deduction, personal_loan_deduction, created_at, paid_at, employees(name)",
    )
    .eq("id", payslipId)
    .eq("business_id", businessId)
    .single();

  if (!business || !payslip) {
    notFound();
  }

  const [{ data: adjustments }, { data: advances }, { data: paidSlips }, { data: personalLoans }, { data: paidSlipsLoans }] =
    await Promise.all([
      supabase
        .from("payslip_adjustments")
        .select("id, type, label, amount")
        .eq("payslip_id", payslipId)
        .order("created_at", { ascending: true }),
      supabase
        .from("employee_advances")
        .select("amount")
        .eq("business_id", businessId)
        .eq("employee_id", payslip.employee_id),
      supabase
        .from("payslips")
        .select("kasbon_deduction")
        .eq("business_id", businessId)
        .eq("employee_id", payslip.employee_id)
        .not("paid_at", "is", null),
      supabase
        .from("employee_personal_loans")
        .select("amount")
        .eq("business_id", businessId)
        .eq("employee_id", payslip.employee_id),
      supabase
        .from("payslips")
        .select("personal_loan_deduction")
        .eq("business_id", businessId)
        .eq("employee_id", payslip.employee_id)
        .not("paid_at", "is", null),
    ]);

  const kasbonGiven = (advances ?? []).reduce((s, a) => s + Number(a.amount), 0);
  const kasbonSettled = (paidSlips ?? []).reduce((s, p) => s + Number(p.kasbon_deduction), 0);
  const outstandingKasbon = Math.max(0, kasbonGiven - kasbonSettled);

  const personalLoanGiven = (personalLoans ?? []).reduce((s, a) => s + Number(a.amount), 0);
  const personalLoanSettled = (paidSlipsLoans ?? []).reduce((s, p) => s + Number(p.personal_loan_deduction), 0);
  const outstandingPersonalLoan = Math.max(0, personalLoanGiven - personalLoanSettled);

  const employee = payslip.employees as unknown as { name: string } | null;
  const tunjangan = (adjustments ?? []).filter((a) => a.type === "tunjangan");
  const potongan = (adjustments ?? []).filter((a) => a.type === "potongan");
  const totalTunjangan = tunjangan.reduce((s, a) => s + Number(a.amount), 0);
  const totalPotongan = potongan.reduce((s, a) => s + Number(a.amount), 0);
  const basePay = Number(payslip.base_pay);
  const mealAllowance = Number(payslip.meal_allowance);
  const attendanceAllowance = Number(payslip.attendance_allowance);
  const lemburAmount = Number(payslip.lembur_amount);
  const thrAmount = Number(payslip.thr_amount);
  const izinDeduction = Number(payslip.izin_deduction);
  const izinWeekendPenalty = Number(payslip.izin_weekend_penalty);
  const lateDeduction = Number(payslip.late_deduction);
  const kasbonDeduction = Number(payslip.kasbon_deduction);
  const personalLoanDeduction = Number(payslip.personal_loan_deduction);
  const totalPendapatan = basePay + mealAllowance + attendanceAllowance + lemburAmount + thrAmount + totalTunjangan;
  const totalSemuaPotongan =
    totalPotongan +
    izinDeduction +
    izinWeekendPenalty +
    lateDeduction +
    kasbonDeduction +
    personalLoanDeduction;
  const totalDiterima = totalPendapatan - totalSemuaPotongan;

  const boundAddAdjustment = addPayslipAdjustment.bind(null, businessId, payslipId);
  const boundUpdateExtras = updatePayslipExtras.bind(null, businessId, payslipId);
  const boundUpdateKasbon = updateKasbonDeduction.bind(null, businessId, payslipId);
  const boundUpdatePersonalLoan = updatePersonalLoanDeduction.bind(null, businessId, payslipId);
  const boundMarkPaid = markPayslipPaid.bind(null, businessId, payslipId);
  const isPaid = Boolean(payslip.paid_at);

  return (
    <div className="w-full max-w-sm print:max-w-none">
        <div className="print:hidden">
          <PrintButton businessId={businessId} />
        </div>

        <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase text-zinc-400">{business.name}</p>
            <h1 className="mt-1 text-lg font-bold text-zinc-900">Slip Gaji</h1>
          </div>

          <div className="mt-4 space-y-1 border-t border-dashed border-zinc-300 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Nama</span>
              <span className="font-medium text-zinc-900">
                {employee?.name ?? "Karyawan terhapus"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Periode</span>
              <span className="font-medium text-zinc-900">
                {formatDate(payslip.period_start)} – {formatDate(payslip.period_end)}
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-1 border-t border-dashed border-zinc-300 pt-3 text-center">
            <div>
              <p className="text-sm font-bold text-brand-700">{payslip.hadir_count}</p>
              <p className="text-[10px] text-zinc-400">Hadir</p>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-600">{payslip.izin_count}</p>
              <p className="text-[10px] text-zinc-400">Izin</p>
            </div>
            <div>
              <p className="text-sm font-bold text-blue-600">{payslip.sakit_count}</p>
              <p className="text-[10px] text-zinc-400">Sakit</p>
            </div>
            <div>
              <p className="text-sm font-bold text-red-600">{payslip.alpa_count}</p>
              <p className="text-[10px] text-zinc-400">Alpa</p>
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-500">{payslip.off_count}</p>
              <p className="text-[10px] text-zinc-400">Off</p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-dashed border-zinc-300 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-600">
                {payslip.salary_type === "bulanan"
                  ? `Gaji Pokok (${payslip.hadir_count + payslip.sakit_count + payslip.izin_count} hari x ${formatRupiah(Number(payslip.monthly_rate) / payslip.hari_kerja_efektif)})`
                  : `Gaji Pokok (${payslip.hadir_count + payslip.sakit_count + payslip.izin_count} hari x ${formatRupiah(Number(payslip.daily_rate))})`}
              </span>
              <span className="font-semibold text-zinc-900">{formatRupiah(basePay)}</span>
            </div>
            {payslip.salary_type === "bulanan" && (
              <p className="text-[11px] text-zinc-400">
                Rp{Number(payslip.monthly_rate).toLocaleString("id-ID")}/bulan ÷ {payslip.hari_kerja_efektif}{" "}
                hari kerja efektif · {payslip.hadir_count} hadir + {payslip.sakit_count} sakit + {payslip.izin_count}{" "}
                izin ({payslip.izin_unnoted_count} tanpa keterangan dipotong di bawah)
              </p>
            )}
            {mealAllowance > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>
                  + Uang Makan ({payslip.hadir_count} hari x{" "}
                  {formatRupiah(mealAllowance / payslip.hadir_count)})
                </span>
                <span>{formatRupiah(mealAllowance)}</span>
              </div>
            )}
            {attendanceAllowance > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>
                  + Tunjangan Kehadiran ({payslip.hadir_count} hari x{" "}
                  {formatRupiah(attendanceAllowance / payslip.hadir_count)})
                </span>
                <span>{formatRupiah(attendanceAllowance)}</span>
              </div>
            )}
            {lemburAmount > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>
                  + Lembur
                  {Number(payslip.lembur_hours) > 0 &&
                    ` (${payslip.lembur_hours} jam x ${formatRupiah(Number(payslip.lembur_rate))})`}
                </span>
                <span>{formatRupiah(lemburAmount)}</span>
              </div>
            )}
            {thrAmount > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>+ THR</span>
                <span>{formatRupiah(thrAmount)}</span>
              </div>
            )}
            {tunjangan.map((a) => (
              <div key={a.id} className="flex justify-between text-brand-700">
                <span className="print:hidden">+ {a.label}</span>
                <span className="hidden print:inline">+ {a.label}</span>
                <span className="flex items-center gap-1.5">
                  {formatRupiah(Number(a.amount))}
                  {!isPaid && (
                    <span className="print:hidden">
                      <DeleteAdjustmentButton
                        businessId={businessId}
                        payslipId={payslipId}
                        adjustmentId={a.id}
                      />
                    </span>
                  )}
                </span>
              </div>
            ))}
            {potongan.map((a) => (
              <div key={a.id} className="flex justify-between text-red-500">
                <span>− {a.label}</span>
                <span className="flex items-center gap-1.5">
                  {formatRupiah(Number(a.amount))}
                  {!isPaid && (
                    <span className="print:hidden">
                      <DeleteAdjustmentButton
                        businessId={businessId}
                        payslipId={payslipId}
                        adjustmentId={a.id}
                      />
                    </span>
                  )}
                </span>
              </div>
            ))}
            {izinDeduction > 0 && (
              <div className="flex justify-between text-red-500">
                <span>
                  − Potongan Izin
                  {payslip.izin_unnoted_count > 0 ? ` Tanpa Keterangan (${payslip.izin_unnoted_count}x hari)` : ""}
                </span>
                <span>{formatRupiah(izinDeduction)}</span>
              </div>
            )}
            {izinWeekendPenalty > 0 && (
              <div className="flex justify-between text-red-500">
                <span>
                  − Denda Izin Weekend/Tanggal Merah ({payslip.izin_unnoted_weekend_count}x hari)
                </span>
                <span>{formatRupiah(izinWeekendPenalty)}</span>
              </div>
            )}
            {lateDeduction > 0 && (
              <div className="flex justify-between text-red-500">
                <span>− Potongan Keterlambatan ({payslip.late_count}x)</span>
                <span>{formatRupiah(lateDeduction)}</span>
              </div>
            )}
            {kasbonDeduction > 0 && (
              <div className="flex justify-between text-red-500">
                <span>− Potongan Kasbon</span>
                <span>{formatRupiah(kasbonDeduction)}</span>
              </div>
            )}
            {personalLoanDeduction > 0 && (
              <div className="flex justify-between text-red-500">
                <span>− Potongan Pinjaman Pribadi</span>
                <span>{formatRupiah(personalLoanDeduction)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-dashed border-zinc-300 pt-2 text-sm font-semibold text-zinc-700">
              <span>Total Pendapatan</span>
              <span>{formatRupiah(totalPendapatan)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-red-600">
              <span>Total Potongan</span>
              <span>−{formatRupiah(totalSemuaPotongan)}</span>
            </div>
            <div className="flex justify-between border-t border-dashed border-zinc-300 pt-2 text-base font-bold text-zinc-900">
              <span>Total Diterima</span>
              <span>{formatRupiah(totalDiterima)}</span>
            </div>
            {isPaid && (
              <p className="text-right text-xs font-medium text-brand-600">
                ✓ Dibayar {formatDate(payslip.paid_at!.slice(0, 10))}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 print:hidden">
          {isPaid ? (
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-center text-xs font-medium text-brand-700">
              ✓ Slip ini sudah dibayar dan tercatat di jurnal (Beban Gaji / Kas &amp; Bank).
            </div>
          ) : (
            <div className="space-y-3">
              <LemburThrForm
                action={boundUpdateExtras}
                initialLembur={lemburAmount}
                initialThr={thrAmount}
              />
              <AddAdjustmentForm action={boundAddAdjustment} />
              <DeductionsForm
                action={boundUpdateKasbon}
                initialKasbon={kasbonDeduction}
                outstandingKasbon={outstandingKasbon}
              />
              <PersonalLoanDeductionForm
                action={boundUpdatePersonalLoan}
                initialPersonalLoan={personalLoanDeduction}
                outstandingPersonalLoan={outstandingPersonalLoan}
              />
              <MarkPaidButton action={boundMarkPaid} totalDiterima={totalDiterima} />
            </div>
          )}
        </div>
    </div>
  );
}
