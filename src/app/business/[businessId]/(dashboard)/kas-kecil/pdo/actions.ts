"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addCashOut, type CashEntryResult } from "../../kas-harian/actions";

export type BankDetailsState = { error: string | null };

// Tipis di atas addCashOut() (bukan duplikasi logic jurnal) -- bedanya cuma
// perlu revalidate halaman PDO juga, karena page ini dirender lewat server
// component yang tidak otomatis ke-refresh oleh revalidatePath("/kas-harian")
// milik addCashOut.
export async function addManualNotaKeluar(
  businessId: string,
  date: string,
  description: string,
  amount: number,
  accountCode: string,
  paymentMethod: "tunai" | "transfer",
): Promise<CashEntryResult> {
  const result = await addCashOut(businessId, date, description, amount, accountCode, paymentMethod);
  if (!result.error) {
    revalidatePath(`/business/${businessId}/kas-kecil/pdo`);
  }
  return result;
}

export async function updateAccountBankDetails(
  businessId: string,
  accountCode: string,
  _prevState: BankDetailsState,
  formData: FormData,
): Promise<BankDetailsState> {
  const bankName = String(formData.get("bankName") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const accountHolder = String(formData.get("accountHolder") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({
      bank_name: bankName || null,
      bank_account_number: accountNumber || null,
      bank_account_holder: accountHolder || null,
    })
    .eq("business_id", businessId)
    .eq("code", accountCode);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/kas-kecil/pdo`);
  return { error: null };
}
