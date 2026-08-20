"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { calcPayslip, effectiveLemburRate } from "./calc";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PayrollDeductionsState = { error: string | null; saved: boolean };

export async function updatePayrollDeductions(
  businessId: string,
  _prevState: PayrollDeductionsState,
  formData: FormData,
): Promise<PayrollDeductionsState> {
  const izinWeekday = Number(formData.get("izinDeductionWeekday"));
  const izinWeekend = Number(formData.get("izinDeductionWeekend"));
  const latePerOccurrence = Number(formData.get("lateDeductionPerOccurrence"));
  const lemburRate = Number(formData.get("lemburRatePerHour"));

  if (Number.isNaN(izinWeekday) || izinWeekday < 0) {
    return { error: "Potongan izin hari biasa harus angka 0 atau lebih.", saved: false };
  }
  if (Number.isNaN(izinWeekend) || izinWeekend < 0) {
    return { error: "Potongan izin weekend harus angka 0 atau lebih.", saved: false };
  }
  if (Number.isNaN(latePerOccurrence) || latePerOccurrence < 0) {
    return { error: "Potongan per keterlambatan harus angka 0 atau lebih.", saved: false };
  }
  if (Number.isNaN(lemburRate) || lemburRate < 0) {
    return { error: "Rate lembur per jam (default) harus angka 0 atau lebih.", saved: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      izin_deduction_weekday: izinWeekday,
      izin_deduction_weekend: izinWeekend,
      late_deduction_per_occurrence: latePerOccurrence,
      lembur_rate_per_hour: lemburRate,
    })
    .eq("id", businessId);

  if (error) {
    return { error: error.message, saved: false };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    "Pengaturan payroll diperbarui",
    `Izin hari biasa Rp${izinWeekday.toLocaleString("id-ID")} · Izin weekend Rp${izinWeekend.toLocaleString("id-ID")} · Per telat Rp${latePerOccurrence.toLocaleString("id-ID")} · Lembur Rp${lemburRate.toLocaleString("id-ID")}/jam`,
  );
  revalidatePath(`/business/${businessId}/payroll`);
  return { error: null, saved: true };
}

export type AddLateTierState = { error: string | null };

export async function addLateTier(
  businessId: string,
  _prevState: AddLateTierState,
  formData: FormData,
): Promise<AddLateTierState> {
  const thresholdMinutes = Number(formData.get("thresholdMinutes"));
  const amount = Number(formData.get("amount"));

  if (!Number.isInteger(thresholdMinutes) || thresholdMinutes < 0) {
    return { error: "Ambang menit harus angka bulat 0 atau lebih." };
  }
  if (Number.isNaN(amount) || amount < 0) {
    return { error: "Nominal potongan harus angka 0 atau lebih." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("late_deduction_tiers").upsert(
    { business_id: businessId, threshold_minutes: thresholdMinutes, amount },
    { onConflict: "business_id,threshold_minutes" },
  );

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    "Tingkatan potongan telat ditambahkan",
    `> ${thresholdMinutes} menit = Rp${amount.toLocaleString("id-ID")}`,
  );
  revalidatePath(`/business/${businessId}/payroll`);
  return { error: null };
}

export async function deleteLateTier(businessId: string, tierId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("late_deduction_tiers")
    .delete()
    .eq("id", tierId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/payroll`);
  return { error: null };
}

// Return value: pesan error kalau posting jurnal gagal, null kalau sukses.
// Baris payslips sudah kadung ditandai dibayar di titik ini (lihat pemanggil)
// — jadi kegagalan di sini tidak dibatalkan, hanya dilaporkan (lihat pola yang
// sama di finance/actions.ts postExpenseJournal, [[mini-erp-scope]]).
async function postPayrollJournal(
  supabase: SupabaseServerClient,
  businessId: string,
  date: string,
  description: string,
  amount: number,
): Promise<string | null> {
  const { error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: description,
    p_lines: [
      { account_code: "5-100", debit: amount, credit: 0 },
      { account_code: "1-001", debit: 0, credit: amount },
    ],
  });
  return error?.message ?? null;
}

export type CreatePayslipResult =
  | { success: true; payslipId: string }
  | { success: false; error: string };

export async function createPayslip(
  businessId: string,
  employeeId: string,
  periodStart: string,
  periodEnd: string,
  lemburHours = 0,
): Promise<CreatePayslipResult> {
  if (!periodStart || !periodEnd || periodStart > periodEnd) {
    return { success: false, error: "Rentang tanggal tidak valid." };
  }
  if (Number.isNaN(lemburHours) || lemburHours < 0) {
    return { success: false, error: "Jam lembur harus angka 0 atau lebih." };
  }

  const supabase = await createClient();

  const [{ data: employee }, { data: business }, { data: lateTierRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("name, salary_type, daily_rate, monthly_rate, lembur_rate_per_hour")
      .eq("id", employeeId)
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("izin_deduction_weekday, izin_deduction_weekend, late_deduction_per_occurrence, lembur_rate_per_hour")
      .eq("id", businessId)
      .single(),
    supabase
      .from("late_deduction_tiers")
      .select("threshold_minutes, amount")
      .eq("business_id", businessId),
  ]);

  if (!employee) {
    return { success: false, error: "Karyawan tidak ditemukan." };
  }
  if (!business) {
    return { success: false, error: "Bisnis tidak ditemukan." };
  }

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("date, status, late, late_minutes")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .gte("date", periodStart)
    .lte("date", periodEnd);

  const salaryType = employee.salary_type === "bulanan" ? "bulanan" : "harian";
  const dailyRate = Number(employee.daily_rate);
  const monthlyRate = Number(employee.monthly_rate);

  const calc = calcPayslip(
    periodStart,
    periodEnd,
    (attendanceRows ?? []).map((r) => ({ ...r, lateMinutes: r.late_minutes })),
    { salaryType, dailyRate, monthlyRate },
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

  const lemburRate = effectiveLemburRate(
    employee.lembur_rate_per_hour === null ? null : Number(employee.lembur_rate_per_hour),
    Number(business.lembur_rate_per_hour),
  );
  const lemburAmount = lemburHours * lemburRate;

  const { data: payslip, error } = await supabase
    .from("payslips")
    .insert({
      business_id: businessId,
      employee_id: employeeId,
      period_start: periodStart,
      period_end: periodEnd,
      salary_type: salaryType,
      daily_rate: dailyRate,
      monthly_rate: monthlyRate,
      lembur_amount: lemburAmount,
      lembur_hours: lemburHours,
      lembur_rate: lemburRate,
      hadir_count: calc.hadirCount,
      izin_count: calc.izinCount,
      sakit_count: calc.sakitCount,
      alpa_count: calc.alpaCount,
      off_count: calc.offCount,
      izin_weekday_count: calc.izinWeekdayCount,
      izin_weekend_count: calc.izinWeekendCount,
      izin_deduction: calc.izinDeduction,
      late_count: calc.lateCount,
      late_deduction: calc.lateDeduction,
      hari_kerja_efektif: calc.hariKerjaEfektif,
      base_pay: calc.basePay,
    })
    .select("id")
    .single();

  if (error || !payslip) {
    return { success: false, error: error?.message ?? "Gagal membuat slip gaji." };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "sukses",
    `Slip gaji dibuat: ${employee.name}`,
    `${periodStart} s/d ${periodEnd} · ${calc.hadirCount} hari kerja`,
  );

  revalidatePath(`/business/${businessId}/payroll`);
  return { success: true, payslipId: payslip.id };
}

export async function deletePayslip(
  businessId: string,
  payslipId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: payslip } = await supabase
    .from("payslips")
    .select("paid_at")
    .eq("id", payslipId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (payslip?.paid_at) {
    return {
      error: "Slip gaji yang sudah dibayar tidak bisa dihapus (sudah ada di jurnal).",
    };
  }

  await supabase.from("payslips").delete().eq("id", payslipId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/payroll`);
  return { error: null };
}

export type MarkPaidResult = { error: string | null };

export async function markPayslipPaid(
  businessId: string,
  payslipId: string,
): Promise<MarkPaidResult> {
  const supabase = await createClient();

  const { data: payslip } = await supabase
    .from("payslips")
    .select(
      "id, base_pay, lembur_amount, thr_amount, izin_deduction, late_deduction, kasbon_deduction, paid_at, period_end, employees(name)",
    )
    .eq("id", payslipId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!payslip) {
    return { error: "Slip gaji tidak ditemukan." };
  }
  if (payslip.paid_at) {
    return { error: "Slip gaji ini sudah ditandai dibayar." };
  }

  const { data: adjustments } = await supabase
    .from("payslip_adjustments")
    .select("type, amount")
    .eq("payslip_id", payslipId);

  const tunjangan = (adjustments ?? [])
    .filter((a) => a.type === "tunjangan")
    .reduce((s, a) => s + Number(a.amount), 0);
  const potongan = (adjustments ?? [])
    .filter((a) => a.type === "potongan")
    .reduce((s, a) => s + Number(a.amount), 0);
  const total =
    Number(payslip.base_pay) +
    Number(payslip.lembur_amount) +
    Number(payslip.thr_amount) +
    tunjangan -
    potongan -
    Number(payslip.izin_deduction) -
    Number(payslip.late_deduction) -
    Number(payslip.kasbon_deduction);

  if (total <= 0) {
    return { error: "Total gaji harus lebih dari 0 untuk ditandai dibayar." };
  }

  const employeeName =
    (payslip.employees as unknown as { name: string } | null)?.name ?? "Karyawan terhapus";

  const { error } = await supabase
    .from("payslips")
    .update({ paid_at: new Date().toISOString() })
    .eq("id", payslipId);

  if (error) {
    return { error: error.message };
  }

  const journalError = await postPayrollJournal(
    supabase,
    businessId,
    payslip.period_end,
    `Gaji: ${employeeName}`,
    total,
  );

  // Laporan → Laba Rugi (yang biasa dibuka lewat menu Laporan) baca dari
  // tabel expenses, BUKAN dari journal_entries — beda sumber data dari
  // Akuntansi → Laba Rugi (Akrual). Tanpa baris ini, gaji yang sudah
  // dibayar tercatat benar di jurnal/Kas & Bank tapi tidak pernah
  // mengurangi laba di Laporan biasa. Kategori "Gaji & Upah" dipakai
  // supaya konsisten dengan kategori yang sudah dikenal di halaman
  // Keuangan → Catat Pengeluaran. Tidak lewat postExpenseJournal — jurnal
  // untuk baris ini sudah diposting di atas lewat postPayrollJournal,
  // insert langsung ke sini biar tidak dobel post jurnal untuk slip yang sama.
  const { error: expenseError } = await supabase.from("expenses").insert({
    business_id: businessId,
    date: payslip.period_end,
    category: "Gaji & Upah",
    amount: total,
    note: `Gaji: ${employeeName}`,
  });

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError || expenseError ? "warning" : "sukses",
    `Slip gaji dibayar: ${employeeName}`,
    journalError
      ? `Rp${total.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : expenseError
        ? `Rp${total.toLocaleString("id-ID")} — GAGAL dicatat ke Laporan Laba Rugi: ${expenseError.message}`
        : `Rp${total.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/payroll`);
  revalidatePath(`/business/${businessId}/payroll/${payslipId}`);

  if (journalError) {
    return {
      error: `Slip gaji ditandai dibayar, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`,
    };
  }
  if (expenseError) {
    return {
      error: `Slip gaji ditandai dibayar dan sudah masuk jurnal, tapi gagal dicatat ke Laporan Laba Rugi (${expenseError.message}). Tambahkan manual di halaman Keuangan → Catat Pengeluaran.`,
    };
  }
  return { error: null };
}

export async function updatePayslipExtras(
  businessId: string,
  payslipId: string,
  lemburAmount: number,
  thrAmount: number,
): Promise<{ error: string | null }> {
  if (Number.isNaN(lemburAmount) || lemburAmount < 0 || Number.isNaN(thrAmount) || thrAmount < 0) {
    return { error: "Nominal lembur dan THR harus angka 0 atau lebih." };
  }

  const supabase = await createClient();

  const { data: payslip } = await supabase
    .from("payslips")
    .select("id, paid_at")
    .eq("id", payslipId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!payslip) {
    return { error: "Slip gaji tidak ditemukan." };
  }
  if (payslip.paid_at) {
    return { error: "Slip gaji sudah dibayar, tidak bisa diubah lagi." };
  }

  const { error } = await supabase
    .from("payslips")
    .update({ lembur_amount: lemburAmount, thr_amount: thrAmount })
    .eq("id", payslipId);

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    "Lembur/THR diperbarui",
    `Lembur Rp${lemburAmount.toLocaleString("id-ID")} · THR Rp${thrAmount.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/payroll/${payslipId}`);
  return { error: null };
}

// Potongan keterlambatan sekarang dihitung otomatis dari attendance.late x
// pengaturan payroll saat slip dibuat (lihat createPayslip) — tidak lagi
// diedit manual di sini. Cuma kasbon yang masih manual, karena itu memang
// keputusan per-periode (mau dipotong berapa dari sisa kasbon), bukan
// sesuatu yang bisa diturunkan otomatis dari data lain.
export async function updateKasbonDeduction(
  businessId: string,
  payslipId: string,
  kasbonDeduction: number,
): Promise<{ error: string | null }> {
  if (Number.isNaN(kasbonDeduction) || kasbonDeduction < 0) {
    return { error: "Nominal potongan kasbon harus angka 0 atau lebih." };
  }

  const supabase = await createClient();

  const { data: payslip } = await supabase
    .from("payslips")
    .select("id, employee_id, paid_at")
    .eq("id", payslipId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!payslip) {
    return { error: "Slip gaji tidak ditemukan." };
  }
  if (payslip.paid_at) {
    return { error: "Slip gaji sudah dibayar, tidak bisa diubah lagi." };
  }

  if (kasbonDeduction > 0) {
    const outstanding = await getOutstandingKasbon(supabase, businessId, payslip.employee_id);
    if (kasbonDeduction > outstanding) {
      return {
        error: `Potongan kasbon (Rp${kasbonDeduction.toLocaleString("id-ID")}) melebihi sisa kasbon karyawan ini (Rp${outstanding.toLocaleString("id-ID")}).`,
      };
    }
  }

  const { error } = await supabase
    .from("payslips")
    .update({ kasbon_deduction: kasbonDeduction })
    .eq("id", payslipId);

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    "Potongan kasbon diperbarui",
    `Rp${kasbonDeduction.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/payroll/${payslipId}`);
  return { error: null };
}

// Sisa kasbon = total kasbon yang pernah diberikan dikurangi kasbon_deduction
// dari slip-slip yang SUDAH dibayar (bukan settled_amount terpisah) — supaya
// potongan di slip yang masih bisa diedit/dihapus belum dianggap lunas.
async function getOutstandingKasbon(
  supabase: SupabaseServerClient,
  businessId: string,
  employeeId: string,
): Promise<number> {
  const [{ data: advances }, { data: paidSlips }] = await Promise.all([
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

  const given = (advances ?? []).reduce((s, a) => s + Number(a.amount), 0);
  const settled = (paidSlips ?? []).reduce((s, p) => s + Number(p.kasbon_deduction), 0);
  return Math.max(0, given - settled);
}

export async function addEmployeeAdvance(
  businessId: string,
  employeeId: string,
  date: string,
  amount: number,
  note: string,
): Promise<{ error: string | null }> {
  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return { error: "Nominal kasbon harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("name")
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!employee) {
    return { error: "Karyawan tidak ditemukan." };
  }

  const { error } = await supabase.from("employee_advances").insert({
    business_id: businessId,
    employee_id: employeeId,
    date,
    amount,
    note: note.trim() || null,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    `Kasbon dicatat: ${employee.name}`,
    `Rp${amount.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/payroll`);
  return { error: null };
}

export type AdjustmentType = "tunjangan" | "potongan";

export async function addPayslipAdjustment(
  businessId: string,
  payslipId: string,
  type: AdjustmentType,
  label: string,
  amount: number,
): Promise<{ error: string | null }> {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return { error: "Nama tunjangan/potongan wajib diisi." };
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return { error: "Nominal harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: payslip } = await supabase
    .from("payslips")
    .select("id, paid_at")
    .eq("id", payslipId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!payslip) {
    return { error: "Slip gaji tidak ditemukan." };
  }
  if (payslip.paid_at) {
    return { error: "Slip gaji sudah dibayar, tidak bisa ditambah tunjangan/potongan lagi." };
  }

  const { error } = await supabase.from("payslip_adjustments").insert({
    payslip_id: payslipId,
    type,
    label: trimmedLabel,
    amount,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    `${type === "tunjangan" ? "Tunjangan" : "Potongan"} ditambahkan: ${trimmedLabel}`,
    `Rp${amount.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/payroll/${payslipId}`);
  return { error: null };
}

export async function deletePayslipAdjustment(
  businessId: string,
  payslipId: string,
  adjustmentId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: payslip } = await supabase
    .from("payslips")
    .select("paid_at")
    .eq("id", payslipId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (payslip?.paid_at) {
    return { error: "Slip gaji sudah dibayar, tidak bisa diubah lagi." };
  }

  await supabase
    .from("payslip_adjustments")
    .delete()
    .eq("id", adjustmentId)
    .eq("payslip_id", payslipId);
  revalidatePath(`/business/${businessId}/payroll/${payslipId}`);
  return { error: null };
}
