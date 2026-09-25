"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function postPrepaidPaymentJournal(
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
      { account_code: "1-502", debit: amount, credit: 0 },
      { account_code: "1-001", debit: 0, credit: amount },
    ],
  });
  return error?.message ?? null;
}

export type AddPrepaidExpenseState = { error: string | null };

export async function addPrepaidExpense(
  businessId: string,
  _prevState: AddPrepaidExpenseState,
  formData: FormData,
): Promise<AddPrepaidExpenseState> {
  const name = (formData.get("name") as string)?.trim();
  const paymentDate = formData.get("paymentDate") as string;
  const totalAmountRaw = formData.get("totalAmount") as string;
  const amortizationMonthsRaw = formData.get("amortizationMonths") as string;
  const expenseAccountCode = formData.get("expenseAccountCode") as string;

  if (!name) {
    return { error: "Nama biaya wajib diisi." };
  }
  if (!paymentDate) {
    return { error: "Tanggal bayar wajib diisi." };
  }

  const totalAmount = Number(totalAmountRaw);
  if (!totalAmountRaw || Number.isNaN(totalAmount) || totalAmount <= 0) {
    return { error: "Total bayar harus angka lebih dari 0." };
  }

  const amortizationMonths = Number(amortizationMonthsRaw);
  if (!amortizationMonthsRaw || Number.isNaN(amortizationMonths) || amortizationMonths <= 0) {
    return { error: "Jumlah bulan cicilan harus angka lebih dari 0." };
  }

  if (!expenseAccountCode) {
    return { error: "Pilih akun beban tujuan cicilan bulanan." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("prepaid_expenses").insert({
    business_id: businessId,
    name,
    payment_date: paymentDate,
    total_amount: totalAmount,
    amortization_months: amortizationMonths,
    expense_account_code: expenseAccountCode,
  });

  if (error) {
    return { error: error.message };
  }

  const journalError = await postPrepaidPaymentJournal(
    supabase,
    businessId,
    paymentDate,
    `Bayar Dimuka: ${name}`,
    totalAmount,
  );

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "sukses",
    `Biaya dibayar dimuka dicatat: ${name}`,
    journalError
      ? `Rp${totalAmount.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : `Rp${totalAmount.toLocaleString("id-ID")} · dicicil ${amortizationMonths} bulan`,
  );

  revalidatePath(`/business/${businessId}/prepaid-expenses`);
  return {
    error: journalError
      ? `Tersimpan, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
      : null,
  };
}

export type PostAmortizationResult = { error: string | null };

export async function postMonthlyAmortization(
  businessId: string,
  period: string, // "YYYY-MM-01"
): Promise<PostAmortizationResult> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("prepaid_expense_postings")
    .select("id")
    .eq("business_id", businessId)
    .eq("period", period)
    .maybeSingle();

  if (existing) {
    return { error: "Cicilan bulan ini sudah pernah diposting." };
  }

  // Sama pola dengan Aset Tetap: item yang dibayar dalam atau sebelum bulan
  // periode ini eligible -- `period` selalu tanggal 1 bulan itu, jadi akhir
  // bulan adalah satu hari sebelum bulan berikutnya.
  const [y, m] = period.split("-").map(Number);
  const periodMonthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const { data: items } = await supabase
    .from("prepaid_expenses")
    .select("id, total_amount, amortization_months, amortized_amount, expense_account_code, payment_date")
    .eq("business_id", businessId)
    .is("disposed_at", null)
    .lte("payment_date", periodMonthEnd);

  let totalAmount = 0;
  const updates: { id: string; newAmortized: number }[] = [];
  const byAccount = new Map<string, number>();

  for (const item of items ?? []) {
    const monthly = Number(item.total_amount) / item.amortization_months;
    const remaining = Number(item.total_amount) - Number(item.amortized_amount);
    if (remaining <= 0) continue;

    const amount = Math.min(monthly, remaining);
    totalAmount += amount;
    updates.push({ id: item.id, newAmortized: Number(item.amortized_amount) + amount });
    byAccount.set(item.expense_account_code, (byAccount.get(item.expense_account_code) ?? 0) + amount);
  }

  if (totalAmount <= 0) {
    return { error: "Tidak ada biaya dibayar dimuka yang perlu dicicil bulan ini." };
  }

  totalAmount = Math.round(totalAmount);

  const debitLines = [...byAccount.entries()].map(([accountCode, amount]) => ({
    account_code: accountCode,
    debit: Math.round(amount),
    credit: 0,
  }));
  // Selisih pembulatan tiap akun (kalau ada) diselipkan ke baris debit
  // pertama supaya total debit tetap sama persis dengan totalAmount --
  // jurnal wajib balance.
  const roundedDebitSum = debitLines.reduce((s, l) => s + l.debit, 0);
  if (roundedDebitSum !== totalAmount && debitLines.length > 0) {
    debitLines[0].debit += totalAmount - roundedDebitSum;
  }

  const { data: entryId, error: journalError } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: period,
    p_description: `Cicilan Biaya Dibayar Dimuka ${period.slice(0, 7)}`,
    p_lines: [...debitLines, { account_code: "1-502", debit: 0, credit: totalAmount }],
  });

  if (journalError) {
    return { error: journalError.message };
  }

  const { error: insertError } = await supabase.from("prepaid_expense_postings").insert({
    business_id: businessId,
    period,
    total_amount: totalAmount,
    journal_entry_id: entryId,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  for (const u of updates) {
    await supabase.from("prepaid_expenses").update({ amortized_amount: u.newAmortized }).eq("id", u.id);
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "sukses",
    `Cicilan biaya dibayar dimuka ${period.slice(0, 7)} diposting`,
    `Rp${totalAmount.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/prepaid-expenses`);
  return { error: null };
}
