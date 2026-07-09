"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type JournalState = { error: string | null };

type LineInput = { account_code: string; debit: number; credit: number };

export async function addJournalEntry(
  businessId: string,
  _prevState: JournalState,
  formData: FormData,
): Promise<JournalState> {
  const date = formData.get("date") as string;
  const description = (formData.get("description") as string)?.trim();
  const linesRaw = formData.get("lines") as string;

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }
  if (!description) {
    return { error: "Keterangan wajib diisi." };
  }

  let lines: LineInput[];
  try {
    lines = JSON.parse(linesRaw);
  } catch {
    return { error: "Baris jurnal tidak valid." };
  }

  const validLines = lines.filter(
    (l) => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0),
  );

  if (validLines.length < 2) {
    return { error: "Minimal 2 baris (debit dan kredit) harus diisi." };
  }

  const totalDebit = validLines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = validLines.reduce((s, l) => s + Number(l.credit), 0);

  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    return {
      error: `Jurnal belum seimbang: debit ${totalDebit.toLocaleString("id-ID")} ≠ kredit ${totalCredit.toLocaleString("id-ID")}.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: description,
    p_lines: validLines,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/accounting/jurnal`);
  return { error: null };
}
