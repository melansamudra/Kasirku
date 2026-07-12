"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AddReconciliationState = { error: string | null; resetToken: number };

export async function addAccountReconciliation(
  businessId: string,
  prevState: AddReconciliationState,
  formData: FormData,
): Promise<AddReconciliationState> {
  const fail = (msg: string): AddReconciliationState => ({
    error: msg,
    resetToken: prevState.resetToken,
  });

  const accountId = formData.get("accountId") as string;
  const statementDate = formData.get("statementDate") as string;
  const statementBalanceRaw = formData.get("statementBalance") as string;
  const note = (formData.get("note") as string)?.trim() || null;

  if (!accountId) {
    return fail("Pilih akun kas/bank.");
  }
  if (!statementDate) {
    return fail("Tanggal wajib diisi.");
  }

  const statementBalance = Number(statementBalanceRaw);
  if (!statementBalanceRaw || Number.isNaN(statementBalance)) {
    return fail("Saldo rekening koran harus berupa angka.");
  }

  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_id, normal_balance")
    .eq("id", accountId)
    .single();

  if (!account || account.business_id !== businessId) {
    return fail("Akun tidak ditemukan.");
  }

  const asOfIso = `${statementDate}T23:59:59+07:00`;
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId)
    .lte("date", asOfIso);

  let raw = 0;
  for (const entry of entries ?? []) {
    const lines = entry.journal_lines as unknown as {
      debit: number;
      credit: number;
      account_id: string;
    }[];
    for (const l of lines) {
      if (l.account_id === accountId) {
        raw += Number(l.debit) - Number(l.credit);
      }
    }
  }
  const bookBalance = account.normal_balance === "debit" ? raw : -raw;
  const difference = statementBalance - bookBalance;

  const { error } = await supabase.from("account_reconciliations").insert({
    business_id: businessId,
    account_id: accountId,
    statement_date: statementDate,
    book_balance: bookBalance,
    statement_balance: statementBalance,
    difference,
    note,
  });

  if (error) {
    return fail(error.message);
  }

  revalidatePath(`/business/${businessId}/accounting/rekonsiliasi`);
  return { error: null, resetToken: prevState.resetToken + 1 };
}
