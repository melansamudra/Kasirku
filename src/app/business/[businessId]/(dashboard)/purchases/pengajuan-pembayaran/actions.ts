"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getCurrentActor } from "@/lib/current-actor";
import { todayWibDateString } from "@/lib/wib";
import { applyPurchasePayment } from "../actions";

export type CreatePaymentRequestResult = { error: string | null; requestId: string | null };

// Satu pengajuan sekarang bisa gabung BANYAK hutang sekaligus (boleh lintas
// supplier) -- staf pilih baris mana saja di Laporan Hutang, jumlah per
// baris SELALU sisa hutang penuh (tidak bisa parsial di alur borongan ini;
// kalau mau bayar sebagian satu hutang tertentu, pakai form "Bayar" instan
// di halaman Pembelian & Hutang, bukan alur pengajuan). Dibuat sebagai
// pengganti createPaymentRequest versi lama (1 purchase per pengajuan) --
// arahan user 2026-09-07.
export async function createBulkPaymentRequest(
  businessId: string,
  purchaseIds: string[],
  paymentMethod: "tunai" | "transfer",
  note: string | null,
): Promise<CreatePaymentRequestResult> {
  const uniqueIds = [...new Set(purchaseIds)];
  if (uniqueIds.length === 0) {
    return { error: "Pilih minimal satu hutang untuk diajukan.", requestId: null };
  }
  if (paymentMethod !== "tunai" && paymentMethod !== "transfer") {
    return { error: "Metode pembayaran wajib dipilih.", requestId: null };
  }

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang.", requestId: null };

  const { data: purchaseRows } = await supabase
    .from("purchases")
    .select("id, amount, paid_amount, voided")
    .eq("business_id", businessId)
    .in("id", uniqueIds);

  const purchaseById = new Map((purchaseRows ?? []).map((p) => [p.id, p]));
  const items: { purchaseId: string; amount: number }[] = [];
  for (const id of uniqueIds) {
    const purchase = purchaseById.get(id);
    if (!purchase) return { error: "Salah satu hutang yang dipilih tidak ditemukan.", requestId: null };
    if (purchase.voided) return { error: "Salah satu hutang yang dipilih sudah dibatalkan.", requestId: null };
    const sisa = Number(purchase.amount) - Number(purchase.paid_amount);
    if (sisa <= 0) return { error: "Salah satu hutang yang dipilih sudah lunas.", requestId: null };
    items.push({ purchaseId: id, amount: sisa });
  }

  const { data: existingPending } = await supabase
    .from("purchase_payment_request_items")
    .select("purchase_id, purchase_payment_requests!inner(status)")
    .in("purchase_id", uniqueIds)
    .eq("purchase_payment_requests.status", "pending");
  if ((existingPending ?? []).length > 0) {
    return {
      error: "Salah satu hutang yang dipilih sudah punya pengajuan yang menunggu persetujuan.",
      requestId: null,
    };
  }

  const totalAmount = items.reduce((s, it) => s + it.amount, 0);

  const { data: inserted, error } = await supabase
    .from("purchase_payment_requests")
    .insert({
      business_id: businessId,
      amount: totalAmount,
      payment_method: paymentMethod,
      note: note || null,
      requested_by_user_id: actor.userId,
      requested_by_name: actor.name,
    })
    .select("id")
    .single();

  if (error) return { error: error.message, requestId: null };

  const { error: itemsError } = await supabase.from("purchase_payment_request_items").insert(
    items.map((it) => ({
      business_id: businessId,
      request_id: inserted.id,
      purchase_id: it.purchaseId,
      amount: it.amount,
    })),
  );
  if (itemsError) {
    // Baris pengajuan sudah kadung tersimpan tapi item gagal -- hapus lagi
    // supaya tidak nyangkut jadi pengajuan kosong tanpa rincian.
    await supabase.from("purchase_payment_requests").delete().eq("id", inserted.id);
    return { error: itemsError.message, requestId: null };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    "Pengajuan pembayaran hutang dibuat",
    `${items.length} hutang · Rp${totalAmount.toLocaleString("id-ID")} · oleh ${actor.name} · menunggu persetujuan Owner`,
  );

  revalidatePath(`/business/${businessId}/purchases/pengajuan-pembayaran`);
  revalidatePath(`/business/${businessId}/purchases/laporan-hutang`);
  return { error: null, requestId: inserted.id };
}

export type RequestActionState = { error: string | null };

// Approve OWNER-ONLY (bukan permission delegable seperti canApprovePo) --
// arahan user 2026-09-07: "perlu approval owner dulu" sebelum pembayaran
// benar-benar tercatat. Pelunasan (update paid_amount + jurnal, SATU per
// item) baru terjadi DI SINI, bukan saat pengajuan dibuat.
export async function approvePaymentRequest(businessId: string, requestId: string): Promise<RequestActionState> {
  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };
  if (!actor.isOwner) {
    return { error: "Hanya akun Owner yang bisa menyetujui pengajuan pembayaran." };
  }

  const { data: request } = await supabase
    .from("purchase_payment_requests")
    .select("id, payment_method, note, status")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!request) return { error: "Pengajuan tidak ditemukan." };
  if (request.status !== "pending") return { error: "Pengajuan ini sudah diproses sebelumnya." };

  const { data: items } = await supabase
    .from("purchase_payment_request_items")
    .select("id, purchase_id, amount")
    .eq("request_id", requestId);
  if (!items || items.length === 0) return { error: "Pengajuan ini tidak punya rincian hutang." };

  const today = todayWibDateString();
  const paymentNote = request.note ? `Pengajuan disetujui: ${request.note}` : "Disetujui dari pengajuan pembayaran";
  const journalErrors: string[] = [];

  for (const item of items) {
    const result = await applyPurchasePayment(
      supabase,
      businessId,
      item.purchase_id,
      today,
      Number(item.amount),
      paymentNote,
      request.payment_method as "tunai" | "transfer",
    );
    if (!result.ok) {
      // Sebagian item mungkin SUDAH kepakai duluan di loop ini (proses tidak
      // dibatalkan tengah jalan) -- kegagalan dilaporkan apa adanya, admin
      // cek Riwayat Pembelian buat lihat item mana yang sukses/gagal.
      journalErrors.push(`Hutang ${item.purchase_id}: ${result.validationError}`);
      continue;
    }
    if (result.journalError) journalErrors.push(`Hutang ${item.purchase_id}: ${result.journalError}`);
  }

  // .eq("status", "pending") di klausa UPDATE -- cegah race 2 approve/reject
  // nyaris bersamaan sama-sama lolos pengecekan status di atas (pola sama
  // seperti approvePurchaseOrder di purchase-orders/actions.ts). Pembayaran
  // di atas SUDAH tersimpan duluan -- kalau update status ini kalah race,
  // pembayaran barusan tetap sah tercatat.
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
    journalErrors.length > 0 ? "warning" : "sukses",
    "Pengajuan pembayaran disetujui",
    journalErrors.length > 0
      ? `${items.length} hutang — sebagian GAGAL posting jurnal: ${journalErrors.join("; ")}`
      : `${items.length} hutang · disetujui oleh ${actor.name}`,
  );

  revalidatePath(`/business/${businessId}/purchases/pengajuan-pembayaran`);
  revalidatePath(`/business/${businessId}/purchases/pengajuan-pembayaran/${requestId}`);
  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/suppliers`);
  revalidatePath(`/business/${businessId}/purchases/laporan-hutang`);
  return {
    error:
      journalErrors.length > 0
        ? `Disetujui & pembayaran tersimpan, tapi sebagian gagal posting ke jurnal (${journalErrors.join("; ")}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
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
