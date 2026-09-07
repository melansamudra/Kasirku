"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getCurrentActor } from "@/lib/current-actor";
import { todayWibDateString } from "@/lib/wib";
import { applyPurchasePayment } from "../actions";

export type CreatePaymentRequestState = { error: string | null; requestId: string | null };

export async function createPaymentRequest(
  businessId: string,
  purchaseId: string,
  _prevState: CreatePaymentRequestState,
  formData: FormData,
): Promise<CreatePaymentRequestState> {
  const amountRaw = formData.get("amount") as string;
  const note = (formData.get("note") as string)?.trim();
  const paymentMethod = formData.get("paymentMethod") as string;

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Jumlah yang diajukan harus angka lebih dari 0.", requestId: null };
  }
  if (paymentMethod !== "tunai" && paymentMethod !== "transfer") {
    return { error: "Metode pembayaran wajib dipilih.", requestId: null };
  }

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang.", requestId: null };

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, amount, paid_amount, voided")
    .eq("id", purchaseId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!purchase) return { error: "Data pembelian tidak ditemukan.", requestId: null };
  if (purchase.voided) return { error: "Pembelian ini sudah dibatalkan.", requestId: null };

  const sisaUtang = Number(purchase.amount) - Number(purchase.paid_amount);
  if (sisaUtang <= 0) return { error: "Hutang ini sudah lunas.", requestId: null };
  if (amount > sisaUtang) {
    return {
      error: `Jumlah yang diajukan melebihi sisa utang (${sisaUtang.toLocaleString("id-ID")}).`,
      requestId: null,
    };
  }

  const { data: existingPending } = await supabase
    .from("purchase_payment_requests")
    .select("id")
    .eq("purchase_id", purchaseId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) {
    return { error: "Sudah ada pengajuan yang menunggu persetujuan untuk hutang ini.", requestId: null };
  }

  const { data: inserted, error } = await supabase
    .from("purchase_payment_requests")
    .insert({
      business_id: businessId,
      purchase_id: purchaseId,
      amount,
      payment_method: paymentMethod,
      note: note || null,
      requested_by_user_id: actor.userId,
      requested_by_name: actor.name,
    })
    .select("id")
    .single();

  if (error) return { error: error.message, requestId: null };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    "Pengajuan pembayaran hutang dibuat",
    `Rp${amount.toLocaleString("id-ID")} · oleh ${actor.name} · menunggu persetujuan Owner`,
  );

  revalidatePath(`/business/${businessId}/purchases/pengajuan-pembayaran`);
  revalidatePath(`/business/${businessId}/purchases/laporan-hutang`);
  return { error: null, requestId: inserted.id };
}

export type RequestActionState = { error: string | null };

// Approve OWNER-ONLY (bukan permission delegable seperti canApprovePo) --
// arahan user 2026-09-07: "perlu approval owner dulu" sebelum pembayaran
// benar-benar tercatat. Pelunasan (update paid_amount + jurnal) baru terjadi
// DI SINI, bukan saat pengajuan dibuat.
export async function approvePaymentRequest(businessId: string, requestId: string): Promise<RequestActionState> {
  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };
  if (!actor.isOwner) {
    return { error: "Hanya akun Owner yang bisa menyetujui pengajuan pembayaran." };
  }

  const { data: request } = await supabase
    .from("purchase_payment_requests")
    .select("id, purchase_id, amount, payment_method, note, status")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!request) return { error: "Pengajuan tidak ditemukan." };
  if (request.status !== "pending") return { error: "Pengajuan ini sudah diproses sebelumnya." };

  const today = todayWibDateString();
  const result = await applyPurchasePayment(
    supabase,
    businessId,
    request.purchase_id,
    today,
    Number(request.amount),
    request.note ? `Pengajuan disetujui: ${request.note}` : "Disetujui dari pengajuan pembayaran",
    request.payment_method as "tunai" | "transfer",
  );
  if (!result.ok) {
    return { error: result.validationError };
  }

  // .eq("status", "pending") di klausa UPDATE -- cegah race 2 approve/reject
  // nyaris bersamaan sama-sama lolos pengecekan status di atas (pola sama
  // seperti approvePurchaseOrder di purchase-orders/actions.ts). Pembayaran
  // di atas SUDAH tersimpan duluan -- kalau update status ini kalah race,
  // itu cuma berarti pihak lain lebih dulu approve/reject; pembayaran barusan
  // tetap sah tercatat (tidak ada dobel karena kalusa status=pending mencegah
  // approve kedua kalinya untuk pengajuan yang sama).
  const { data: updated, error } = await supabase
    .from("purchase_payment_requests")
    .update({
      status: "approved",
      approved_by_user_id: actor.userId,
      approved_by_name: actor.name,
      approved_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("business_id", businessId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) {
    return {
      error:
        "Pengajuan ini baru saja diproses pihak lain. Pembayaran barusan tetap tersimpan di Riwayat Pembelian — cek di sana kalau ragu, jangan approve ulang.",
    };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    result.journalError ? "warning" : "sukses",
    "Pengajuan pembayaran disetujui",
    result.journalError
      ? `Rp${Number(request.amount).toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${result.journalError}`
      : `Rp${Number(request.amount).toLocaleString("id-ID")} · disetujui oleh ${actor.name}`,
  );

  revalidatePath(`/business/${businessId}/purchases/pengajuan-pembayaran`);
  revalidatePath(`/business/${businessId}/purchases/pengajuan-pembayaran/${requestId}`);
  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/suppliers`);
  revalidatePath(`/business/${businessId}/purchases/laporan-hutang`);
  return {
    error: result.journalError
      ? `Disetujui & pembayaran tersimpan, tapi gagal posting ke jurnal (${result.journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
      : null,
  };
}

export async function rejectPaymentRequest(
  businessId: string,
  requestId: string,
  reason: string,
): Promise<RequestActionState> {
  reason = reason.trim();
  if (!reason) return { error: "Alasan penolakan wajib diisi." };

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };
  if (!actor.isOwner) {
    return { error: "Hanya akun Owner yang bisa menolak pengajuan pembayaran." };
  }

  const { data: request } = await supabase
    .from("purchase_payment_requests")
    .select("id, amount, status")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!request) return { error: "Pengajuan tidak ditemukan." };
  if (request.status !== "pending") return { error: "Pengajuan ini sudah diproses sebelumnya." };

  const { data: updated, error } = await supabase
    .from("purchase_payment_requests")
    .update({
      status: "rejected",
      approved_by_user_id: actor.userId,
      approved_by_name: actor.name,
      approved_at: new Date().toISOString(),
      reject_reason: reason,
    })
    .eq("id", requestId)
    .eq("business_id", businessId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "Pengajuan ini baru saja diproses pihak lain — refresh halaman." };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "warning",
    "Pengajuan pembayaran ditolak",
    `Rp${Number(request.amount).toLocaleString("id-ID")} · oleh ${actor.name} — ${reason}`,
  );

  revalidatePath(`/business/${businessId}/purchases/pengajuan-pembayaran`);
  revalidatePath(`/business/${businessId}/purchases/pengajuan-pembayaran/${requestId}`);
  return { error: null };
}
