"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type CashEntryResult = { error: string | null };

async function postCashEntry(
  businessId: string,
  date: string,
  description: string,
  amount: number,
  direction: "in" | "out",
): Promise<CashEntryResult> {
  const trimmedDescription = description.trim();
  if (!trimmedDescription) {
    return { error: "Keterangan wajib diisi." };
  }
  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }
  if (!amount || Number.isNaN(amount) || amount <= 0) {
    return { error: "Jumlah harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const lines =
    direction === "in"
      ? [
          { account_code: "1-001", debit: amount, credit: 0 },
          { account_code: "4-999", debit: 0, credit: amount },
        ]
      : [
          { account_code: "5-999", debit: amount, credit: 0 },
          { account_code: "1-001", debit: 0, credit: amount },
        ];

  const { error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: trimmedDescription,
    p_lines: lines,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "sukses",
    direction === "in" ? `Kas Masuk: ${trimmedDescription}` : `Kas Keluar: ${trimmedDescription}`,
    `Rp${amount.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/kas-harian`);
  revalidatePath(`/business/${businessId}/accounting/jurnal`);
  return { error: null };
}

export async function addCashIn(
  businessId: string,
  date: string,
  description: string,
  amount: number,
): Promise<CashEntryResult> {
  return postCashEntry(businessId, date, description, amount, "in");
}

export async function addCashOut(
  businessId: string,
  date: string,
  description: string,
  amount: number,
): Promise<CashEntryResult> {
  return postCashEntry(businessId, date, description, amount, "out");
}
