"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TransferState = { error: string | null };

export async function addTransfer(
  businessId: string,
  _prevState: TransferState,
  formData: FormData,
): Promise<TransferState> {
  const date = formData.get("date") as string;
  const fromCode = formData.get("fromCode") as string;
  const toCode = formData.get("toCode") as string;
  const description = (formData.get("description") as string)?.trim();
  const amountRaw = formData.get("amount") as string;

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }
  if (!fromCode || !toCode) {
    return { error: "Pilih akun asal dan tujuan." };
  }
  if (fromCode === toCode) {
    return { error: "Akun asal dan tujuan tidak boleh sama." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Nominal harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: description ? `Transfer: ${description}` : "Transfer antar akun kas/bank",
    p_lines: [
      { account_code: toCode, debit: amount, credit: 0 },
      { account_code: fromCode, debit: 0, credit: amount },
    ],
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/accounting/transfer-kas`);
  return { error: null };
}
