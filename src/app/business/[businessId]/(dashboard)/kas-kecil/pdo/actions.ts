"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BankDetailsState = { error: string | null };

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
