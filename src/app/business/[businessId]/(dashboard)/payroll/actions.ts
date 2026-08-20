"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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
): Promise<CreatePayslipResult> {
  if (!periodStart || !periodEnd || periodStart > periodEnd) {
    return { success: false, error: "Rentang tanggal tidak valid." };
  }

  const supabase = await createClient();

  const [{ data: employee }, { data: business }] = await Promise.all([
    supabase
      .from("employees")
      .select("name, salary_type, daily_rate, monthly_rate")
      .eq("id", employeeId)
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("izin_deduction_weekday, izin_deduction_weekend, late_deduction_per_occurrence")
      .eq("id", businessId)
      .single(),
  ]);

  if (!employee) {
    return { success: false, error: "Karyawan tidak ditemukan." };
  }
  if (!business) {
    return { success: false, error: "Bisnis tidak ditemukan." };
  }

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("date, status, late")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .gte("date", periodStart)
    .lte("date", periodEnd);

  const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, off: 0 };
  let izinWeekdayCount = 0;
  let izinWeekendCount = 0;
  let lateCount = 0;
  for (const r of attendanceRows ?? []) {
    counts[r.status as keyof typeof counts] += 1;
    if (r.status === "izin") {
      const dow = new Date(`${r.date}T00:00:00Z`).getUTCDay(); // 0 = Minggu, 6 = Sabtu
      if (dow === 0 || dow === 6) izinWeekendCount += 1;
      else izinWeekdayCount += 1;
    }
    if (r.late) lateCount += 1;
  }

  // Hari kerja efektif = total hari di periode dikurangi hari Off — dipakai
  // buat menurunkan rate harian dari gaji bulanan, jadi beda tiap bulan
  // tergantung panjang bulan & berapa hari Off yang diberikan.
  const totalDaysInPeriod =
    Math.round(
      (new Date(`${periodEnd}T00:00:00Z`).getTime() - new Date(`${periodStart}T00:00:00Z`).getTime()) /
        86400000,
    ) + 1;
  const hariKerjaEfektif = Math.max(1, totalDaysInPeriod - counts.off);

  const salaryType = employee.salary_type === "bulanan" ? "bulanan" : "harian";
  const dailyRate = Number(employee.daily_rate);
  const monthlyRate = Number(employee.monthly_rate);
  // Izin sekarang dihitung tetap dibayar (seperti hadir) di gaji pokok, tapi
  // kena potongan tetap terpisah — menggantikan cara lama (izin = tidak
  // dihitung sama sekali, sehingga upah hari itu hilang begitu saja).
  const dailyEquivalent = salaryType === "bulanan" ? monthlyRate / hariKerjaEfektif : dailyRate;
  const basePay = dailyEquivalent * (counts.hadir + counts.izin);

  const izinDeductionWeekday = Number(business.izin_deduction_weekday);
  const izinDeductionWeekend = Number(business.izin_deduction_weekend);
  const izinDeduction = izinWeekdayCount * izinDeductionWeekday + izinWeekendCount * izinDeductionWeekend;

  const lateDeductionPerOccurrence = Number(business.late_deduction_per_occurrence);
  const lateDeduction = lateCount * lateDeductionPerOccurrence;

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
      hadir_count: counts.hadir,
      izin_count: counts.izin,
      sakit_count: counts.sakit,
      alpa_count: counts.alpa,
      off_count: counts.off,
      izin_weekday_count: izinWeekdayCount,
      izin_weekend_count: izinWeekendCount,
      izin_deduction: izinDeduction,
      late_count: lateCount,
      late_deduction: lateDeduction,
      hari_kerja_efektif: hariKerjaEfektif,
      base_pay: basePay,
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
    `${periodStart} s/d ${periodEnd} · ${counts.hadir} hari kerja`,
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

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "sukses",
    `Slip gaji dibayar: ${employeeName}`,
    journalError
      ? `Rp${total.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : `Rp${total.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/payroll`);
  revalidatePath(`/business/${businessId}/payroll/${payslipId}`);

  return {
    error: journalError
      ? `Slip gaji ditandai dibayar, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
      : null,
  };
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
