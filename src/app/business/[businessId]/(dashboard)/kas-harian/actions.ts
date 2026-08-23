"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type CashEntryResult = { error: string | null };

async function postCashEntry(
  businessId: string,
  date: string,
  description: string,
  amount: number,
  direction: "in" | "out",
  accountCode: string,
  paymentMethod: "tunai" | "transfer",
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
  if (!accountCode) {
    return { error: "Akun wajib dipilih." };
  }
  if (paymentMethod !== "tunai" && paymentMethod !== "transfer") {
    return { error: "Metode pembayaran wajib dipilih." };
  }

  const supabase = await createClient();

  const lines =
    direction === "in"
      ? [
          { account_code: "1-001", debit: amount, credit: 0 },
          { account_code: accountCode, debit: 0, credit: amount },
        ]
      : [
          { account_code: accountCode, debit: amount, credit: 0 },
          { account_code: "1-001", debit: 0, credit: amount },
        ];

  const { data: entryId, error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: trimmedDescription,
    p_lines: lines,
  });

  if (error) {
    return { error: error.message };
  }

  // post_journal_entry() belum punya parameter payment_method (lihat bug
  // overload 2026-08-23 -- nambah parameter baru bikin dua fungsi ter-
  // overload, jadi tidak diulang lagi) -- diisi lewat RPC terpisah setelah
  // entrinya jadi. Laporan Harian pakai kolom ini buat pisahin Pengeluaran
  // Tunai vs Transfer. Bukan `.update()` langsung -- journal_entries cuma
  // punya policy SELECT (disengaja, kolom finansial immutable setelah
  // diposting), jadi update langsung dari client kena filter RLS diam-diam
  // (0 baris ke-update, tidak ada error) -- makanya lewat RPC security
  // definer sempit yang cuma boleh nyentuh kolom payment_method.
  if (entryId) {
    const { error: paymentMethodError } = await supabase.rpc("set_journal_entry_payment_method", {
      p_entry_id: entryId,
      p_payment_method: paymentMethod,
    });
    if (paymentMethodError) {
      return { error: paymentMethodError.message };
    }
  }

  // Best-effort (lihat komentar di activity-log.ts) -- dipindah ke after()
  // supaya tidak ikut memperlambat respons ke kasir/admin yang lagi input
  // cepat berturut-turut. Tetap dijamin jalan (bukan fire-and-forget yang
  // bisa mati kepotong kalau function serverless-nya keburu selesai).
  after(() =>
    logActivity(
      supabase,
      businessId,
      "sistem",
      "sukses",
      direction === "in" ? `Kas Masuk: ${trimmedDescription}` : `Kas Keluar: ${trimmedDescription}`,
      `Rp${amount.toLocaleString("id-ID")}`,
    ),
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
  accountCode: string,
  paymentMethod: "tunai" | "transfer",
): Promise<CashEntryResult> {
  return postCashEntry(businessId, date, description, amount, "in", accountCode, paymentMethod);
}

export async function addCashOut(
  businessId: string,
  date: string,
  description: string,
  amount: number,
  accountCode: string,
  paymentMethod: "tunai" | "transfer",
): Promise<CashEntryResult> {
  return postCashEntry(businessId, date, description, amount, "out", accountCode, paymentMethod);
}
