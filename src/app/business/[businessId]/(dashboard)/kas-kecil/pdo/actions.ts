"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addTransfer, type TransferState } from "../../accounting/transfer-kas/actions";

export type BankDetailsState = { error: string | null };

// Tipis di atas addTransfer() -- addTransfer sendiri cuma revalidate halaman
// Transfer Kas (dia gak tahu ada halaman PDO yang mengandalkan transfer yang
// sama). Tanpa ini, Riwayat Permintaan & daftar nota di PDO baru ke-refresh
// kalau halamannya di-reload manual.
export async function submitPdoTransfer(
  businessId: string,
  prevState: TransferState,
  formData: FormData,
): Promise<TransferState> {
  const result = await addTransfer(businessId, prevState, formData);
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
