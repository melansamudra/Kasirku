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
  cashierId: string,
  periodStart: string,
  periodEnd: string,
): Promise<CreatePayslipResult> {
  if (!periodStart || !periodEnd || periodStart > periodEnd) {
    return { success: false, error: "Rentang tanggal tidak valid." };
  }

  const supabase = await createClient();

  const { data: cashier } = await supabase
    .from("cashiers")
    .select("name, daily_rate")
    .eq("id", cashierId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!cashier) {
    return { success: false, error: "Kasir tidak ditemukan." };
  }

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("status")
    .eq("business_id", businessId)
    .eq("cashier_id", cashierId)
    .gte("date", periodStart)
    .lte("date", periodEnd);

  const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  for (const r of attendanceRows ?? []) {
    counts[r.status as keyof typeof counts] += 1;
  }

  const dailyRate = Number(cashier.daily_rate);
  const basePay = dailyRate * counts.hadir;

  const { data: payslip, error } = await supabase
    .from("payslips")
    .insert({
      business_id: businessId,
      cashier_id: cashierId,
      period_start: periodStart,
      period_end: periodEnd,
      daily_rate: dailyRate,
      hadir_count: counts.hadir,
      izin_count: counts.izin,
      sakit_count: counts.sakit,
      alpa_count: counts.alpa,
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
    `Slip gaji dibuat: ${cashier.name}`,
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
    .select("id, base_pay, paid_at, period_end, cashiers(name)")
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
  const total = Number(payslip.base_pay) + tunjangan - potongan;

  if (total <= 0) {
    return { error: "Total gaji harus lebih dari 0 untuk ditandai dibayar." };
  }

  const cashierName =
    (payslip.cashiers as unknown as { name: string } | null)?.name ?? "Kasir terhapus";

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
    `Gaji: ${cashierName}`,
    total,
  );

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "sukses",
    `Slip gaji dibayar: ${cashierName}`,
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
