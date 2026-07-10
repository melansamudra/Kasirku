"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Return value: pesan error kalau posting jurnal gagal, null kalau sukses —
// baris receivables sudah kadung tersimpan di titik pemanggilan, jadi
// kegagalan di sini hanya dilaporkan, bukan membatalkan pencatatan (lihat
// pola yang sama di purchases/actions.ts, [[mini-erp-scope]]).
async function postReceivableJournal(
  supabase: SupabaseServerClient,
  businessId: string,
  date: string,
  description: string,
  amount: number,
  paidAmount: number,
): Promise<string | null> {
  const lines: { account_code: string; debit: number; credit: number }[] = [];
  if (paidAmount > 0) {
    lines.push({ account_code: "1-001", debit: paidAmount, credit: 0 });
  }
  const sisaPiutang = amount - paidAmount;
  if (sisaPiutang > 0) {
    lines.push({ account_code: "1-100", debit: sisaPiutang, credit: 0 });
  }
  lines.push({ account_code: "4-001", debit: 0, credit: amount });

  const { error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: description,
    p_lines: lines,
  });
  return error?.message ?? null;
}

export type AddReceivableState = { error: string | null };

export async function addReceivable(
  businessId: string,
  _prevState: AddReceivableState,
  formData: FormData,
): Promise<AddReceivableState> {
  const customerId = (formData.get("customerId") as string) || null;
  const date = formData.get("date") as string;
  const description = (formData.get("description") as string)?.trim();
  const amountRaw = formData.get("amount") as string;
  const paidAmountRaw = formData.get("paidAmount") as string;

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }
  if (!description) {
    return { error: "Deskripsi wajib diisi." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Total tagihan harus angka lebih dari 0." };
  }

  const paidAmount = paidAmountRaw ? Number(paidAmountRaw) : 0;
  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    return { error: "Jumlah dibayar harus angka dan tidak boleh negatif." };
  }
  if (paidAmount > amount) {
    return { error: "Jumlah dibayar tidak boleh lebih besar dari total tagihan." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("receivables").insert({
    business_id: businessId,
    customer_id: customerId,
    date,
    description,
    amount,
    paid_amount: paidAmount,
  });

  if (error) {
    return { error: error.message };
  }

  const journalError = await postReceivableJournal(
    supabase,
    businessId,
    date,
    `Piutang: ${description}`,
    amount,
    paidAmount,
  );

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "sukses",
    `Piutang dicatat: ${description}`,
    journalError
      ? `Rp${amount.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : `Rp${amount.toLocaleString("id-ID")}${paidAmount < amount ? " · sebagian/seluruhnya piutang" : " · lunas"}`,
  );

  revalidatePath(`/business/${businessId}/receivables`);
  revalidatePath(`/business/${businessId}/customers`);
  return {
    error: journalError
      ? `Piutang tersimpan, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
      : null,
  };
}

export type AddReceivablePaymentState = { error: string | null };

export async function addReceivablePayment(
  businessId: string,
  receivableId: string,
  _prevState: AddReceivablePaymentState,
  formData: FormData,
): Promise<AddReceivablePaymentState> {
  const date = formData.get("date") as string;
  const amountRaw = formData.get("amount") as string;
  const note = (formData.get("note") as string)?.trim();

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Jumlah bayar harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: receivable } = await supabase
    .from("receivables")
    .select("id, business_id, amount, paid_amount")
    .eq("id", receivableId)
    .eq("business_id", businessId)
    .single();

  if (!receivable) {
    return { error: "Data piutang tidak ditemukan." };
  }

  const sisaPiutang = Number(receivable.amount) - Number(receivable.paid_amount);
  if (amount > sisaPiutang) {
    return { error: `Jumlah bayar melebihi sisa piutang (${sisaPiutang.toLocaleString("id-ID")}).` };
  }

  const newPaidAmount = Number(receivable.paid_amount) + amount;

  const { error: updateError } = await supabase
    .from("receivables")
    .update({ paid_amount: newPaidAmount })
    .eq("id", receivableId);

  if (updateError) {
    return { error: updateError.message };
  }

  const { error } = await supabase.from("receivable_payments").insert({
    business_id: businessId,
    receivable_id: receivableId,
    date,
    amount,
    note: note || null,
  });

  if (error) {
    return { error: error.message };
  }

  const { error: journalRpcError } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: "Terima pembayaran piutang",
    p_lines: [
      { account_code: "1-001", debit: amount, credit: 0 },
      { account_code: "1-100", debit: 0, credit: amount },
    ],
  });
  const journalError = journalRpcError?.message ?? null;

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "info",
    "Terima pembayaran piutang",
    journalError
      ? `Rp${amount.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : `Rp${amount.toLocaleString("id-ID")}${note ? ` · ${note}` : ""}`,
  );

  revalidatePath(`/business/${businessId}/receivables`);
  revalidatePath(`/business/${businessId}/customers`);
  return {
    error: journalError
      ? `Pembayaran tersimpan, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
      : null,
  };
}
