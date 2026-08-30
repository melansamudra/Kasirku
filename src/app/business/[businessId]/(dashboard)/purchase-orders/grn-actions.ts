"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getCurrentActor } from "@/lib/current-actor";

export type GrnActionState = { error: string | null };

export type GrnItemInput = {
  poItemId: string;
  qtyReceived: number;
  condition: "ok" | "rejected";
  conditionNote?: string;
};

// Fase 2 GRN -- gantikan "flip timestamp" markAllocationReceived dengan
// verifikasi sungguhan: qty diterima per item PO (boleh parsial, boleh
// lebih dari 1 GRN per PO untuk pengiriman bertahap) + kondisi barang.
// Sengaja TIDAK menyentuh stok sama sekali -- itu masih titik "Catat
// Pembelian" seperti sebelumnya (keputusan user, lihat plan). `receivedBy`
// dulu dropdown nama bebas dari `employees` (tidak terikat sesi login) --
// diperbaiki 2026-08-31 (audit cost-control) pakai identitas akun yang
// sedang login, konsisten dengan approve PO/budget.
export async function createGoodsReceiptNote(
  businessId: string,
  purchaseOrderId: string,
  items: GrnItemInput[],
): Promise<GrnActionState> {
  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const meaningfulItems = items.filter((it) => it.qtyReceived > 0);
  if (meaningfulItems.length === 0) {
    return { error: "Isi qty diterima untuk minimal 1 barang." };
  }
  for (const it of meaningfulItems) {
    if (it.qtyReceived < 0 || Number.isNaN(it.qtyReceived)) {
      return { error: "Qty diterima tidak valid." };
    }
    if (it.condition === "rejected" && !it.conditionNote?.trim()) {
      return { error: "Barang yang ditandai Rusak/Tolak wajib diberi catatan." };
    }
  }

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status")
    .eq("id", purchaseOrderId)
    .eq("business_id", businessId)
    .single();
  if (!po) return { error: "PO tidak ditemukan." };
  if (po.status !== "approved") {
    return { error: "PO ini belum di-approve — belum bisa dicatat penerimaannya." };
  }

  const { data: poItems } = await supabase
    .from("purchase_order_items")
    .select("id")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("business_id", businessId);
  const validPoItemIds = new Set((poItems ?? []).map((i) => i.id));
  if (meaningfulItems.some((it) => !validPoItemIds.has(it.poItemId))) {
    return { error: "Ada barang yang tidak sesuai dengan PO ini." };
  }

  const now = new Date();
  const dateCompact = now.toISOString().slice(0, 10).replaceAll("-", "");
  const grnNumber = `GRN-${dateCompact}-${Date.now().toString().slice(-6)}`;

  const { data: grn, error: grnError } = await supabase
    .from("goods_receipt_notes")
    .insert({
      business_id: businessId,
      purchase_order_id: purchaseOrderId,
      grn_number: grnNumber,
      received_by: actor.name,
      received_by_user_id: actor.userId,
    })
    .select("id")
    .single();

  if (grnError || !grn) return { error: grnError?.message ?? "Gagal mencatat penerimaan barang." };

  const { error: itemsError } = await supabase.from("goods_receipt_note_items").insert(
    meaningfulItems.map((it) => ({
      business_id: businessId,
      grn_id: grn.id,
      purchase_order_item_id: it.poItemId,
      qty_received: it.qtyReceived,
      condition: it.condition,
      condition_note: it.conditionNote?.trim() || null,
    })),
  );

  if (itemsError) {
    // Header GRN sudah kesave tanpa item -- hapus lagi supaya tidak nyangkut
    // GRN kosong yang bikin bingung riwayat penerimaan.
    await supabase.from("goods_receipt_notes").delete().eq("id", grn.id).eq("business_id", businessId);
    return { error: itemsError.message };
  }

  const rejectedCount = meaningfulItems.filter((it) => it.condition === "rejected").length;
  await logActivity(
    supabase,
    businessId,
    "produk",
    rejectedCount > 0 ? "warning" : "sukses",
    `Barang diterima: ${po.po_number} (${grnNumber})`,
    `Oleh ${actor.name} — ${meaningfulItems.length} barang${rejectedCount > 0 ? `, ${rejectedCount} ditolak` : ""}`,
  );

  revalidatePath(`/business/${businessId}/purchase-orders`);
  revalidatePath(`/business/${businessId}/purchase-orders/${purchaseOrderId}`);
  revalidatePath(`/business/${businessId}/lokasi`, "layout");
  return { error: null };
}
