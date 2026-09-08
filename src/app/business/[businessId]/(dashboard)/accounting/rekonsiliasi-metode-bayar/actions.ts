"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { logActivity } from "@/lib/activity-log";

export type PaymentReconciliationState = { error: string | null; resetToken: number };

// Sama filosofinya dengan postExpenseJournal (finance/actions.ts) tapi
// sengaja tidak reuse langsung -- source di sini "rekonsiliasi-metode-bayar",
// beda dari "beban" biasa, supaya bisa dibedakan asalnya kalau perlu ditelusuri.
async function postAdminFeeJournal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  date: string,
  description: string,
  amount: number,
  sourceId: string,
): Promise<{ entryId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: description,
    p_lines: [
      { account_code: "5-109", debit: amount, credit: 0 },
      { account_code: "1-001", debit: 0, credit: amount },
    ],
    p_source: "rekonsiliasi-metode-bayar",
    p_source_id: sourceId,
  });
  return { entryId: data ?? null, error: error?.message ?? null };
}

export async function createPaymentReconciliation(
  businessId: string,
  prevState: PaymentReconciliationState,
  formData: FormData,
): Promise<PaymentReconciliationState> {
  const fail = (msg: string): PaymentReconciliationState => ({
    error: msg,
    resetToken: prevState.resetToken,
  });

  const paymentMethod = (formData.get("paymentMethod") as string)?.trim();
  const periodStart = formData.get("periodStart") as string;
  const periodEnd = formData.get("periodEnd") as string;
  const receivedAmountRaw = formData.get("receivedAmount") as string;
  const note = (formData.get("note") as string)?.trim() || null;

  if (!paymentMethod) return fail("Pilih metode bayar.");
  if (!periodStart || !periodEnd || periodStart > periodEnd) return fail("Rentang tanggal tidak valid.");
  const receivedAmount = Number(receivedAmountRaw);
  if (!receivedAmountRaw || Number.isNaN(receivedAmount) || receivedAmount < 0) {
    return fail("Nominal diterima harus angka 0 atau lebih.");
  }

  const supabase = await createClient();

  // Total menurut sistem = jumlah transaction_payments dengan method ini,
  // pada transaksi (tidak dibatalkan) di rentang tanggal yang dipilih.
  // Dipaginasi penuh (lihat lib/pagination.ts) supaya tidak kena potongan
  // diam-diam di 1000 baris kalau volume transaksinya besar.
  const rows = await fetchAllRows<{ amount: number; transactions: { voided: boolean; date: string } | null }>(
    (from, to) =>
      supabase
        .from("transaction_payments")
        .select("amount, transactions!inner(voided, date, business_id)")
        .eq("method", paymentMethod)
        .eq("transactions.business_id", businessId)
        .eq("transactions.voided", false)
        .gte("transactions.date", `${periodStart}T00:00:00+07:00`)
        .lte("transactions.date", `${periodEnd}T23:59:59+07:00`)
        .range(from, to),
  );

  const expectedAmount = rows.reduce((s, r) => s + Number(r.amount), 0);
  const difference = expectedAmount - receivedAmount;

  const { data: recon, error: insertError } = await supabase
    .from("payment_reconciliations")
    .insert({
      business_id: businessId,
      payment_method: paymentMethod,
      period_start: periodStart,
      period_end: periodEnd,
      expected_amount: expectedAmount,
      received_amount: receivedAmount,
      difference,
      note,
    })
    .select("id")
    .single();

  if (insertError || !recon) {
    return fail(insertError?.message ?? "Gagal menyimpan rekonsiliasi.");
  }

  // Selisih positif (sistem > diterima) = kena potongan, otomatis jadi
  // beban. Selisih negatif (diterima > sistem) sengaja TIDAK auto-posting --
  // kasus tidak biasa, biarkan owner cek manual dulu (lihat catatan di
  // migration 20260909140000_payment_method_reconciliation.sql).
  if (difference > 0) {
    const description = `Selisih ${paymentMethod} ${periodStart} s/d ${periodEnd}`;
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        business_id: businessId,
        date: periodEnd,
        category: "Biaya Admin Bank/EDC",
        amount: difference,
        note: description,
      })
      .select("id")
      .single();

    if (expenseError) {
      return fail(`Rekonsiliasi tersimpan, tapi gagal mencatat beban: ${expenseError.message}`);
    }

    const { entryId, error: journalError } = await postAdminFeeJournal(
      supabase,
      businessId,
      `${periodEnd}T23:59:00+07:00`,
      description,
      difference,
      recon.id,
    );

    await supabase
      .from("payment_reconciliations")
      .update({ expense_id: expense?.id ?? null, journal_entry_id: entryId })
      .eq("id", recon.id);

    await logActivity(
      supabase,
      businessId,
      "sistem",
      journalError ? "warning" : "sukses",
      `Rekonsiliasi ${paymentMethod}: selisih Rp${difference.toLocaleString("id-ID")} dicatat sebagai beban`,
      journalError ? `Gagal posting jurnal: ${journalError}` : description,
    );
  } else {
    await logActivity(
      supabase,
      businessId,
      "sistem",
      "info",
      `Rekonsiliasi ${paymentMethod} dicatat`,
      difference < 0
        ? `Diterima Rp${Math.abs(difference).toLocaleString("id-ID")} lebih besar dari sistem — tidak diposting otomatis, cek manual.`
        : "Cocok, tidak ada selisih.",
    );
  }

  revalidatePath(`/business/${businessId}/accounting/rekonsiliasi-metode-bayar`);
  return { error: null, resetToken: prevState.resetToken + 1 };
}
