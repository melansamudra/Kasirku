"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type DeliveryNoteActionState = { error: string | null; deliveryNoteId?: string };

export type DeliveryNoteItemInput = {
  sourceType: "stock_fulfillment" | "grn_item";
  sourceId: string;
  itemName: string;
  unit: string;
  qty: number;
};

// Surat Jalan -- dokumen fisik yang menyertai barang keluar dari Gudang
// Utama. Murni paper-trail, TIDAK memindahkan stok (lihat migration
// 20260829010000_delivery_notes.sql). Granularitas "1 batch siap kirim = 1
// Surat Jalan" -- staf pilih sendiri barang mana saja yang masuk 1 dokumen
// (bisa campur sumber "Ambil dari Gudang" + "dari supplier" sekaligus, atau
// dipisah kalau belum semuanya ready).
export async function createDeliveryNote(
  businessId: string,
  requestId: string,
  preparedBy: string,
  items: DeliveryNoteItemInput[],
): Promise<DeliveryNoteActionState> {
  if (!preparedBy.trim()) {
    return { error: "Pilih nama yang menyiapkan barang ini." };
  }
  if (items.length === 0) {
    return { error: "Pilih minimal 1 barang untuk dimasukkan ke Surat Jalan." };
  }

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, location_id")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .single();
  if (!request) return { error: "Permintaan Barang tidak ditemukan." };

  const { data: fromLocation } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("business_id", businessId)
    .eq("is_default_purchase", true)
    .maybeSingle();
  if (!fromLocation) return { error: "Lokasi default (Gudang Utama) tidak ditemukan. Hubungi admin." };

  let toLocationName = "—";
  if (request.location_id) {
    const { data: toLocation } = await supabase
      .from("stock_locations")
      .select("name")
      .eq("id", request.location_id)
      .maybeSingle();
    toLocationName = toLocation?.name ?? "—";
  }

  const now = new Date();
  const dateCompact = now.toISOString().slice(0, 10).replaceAll("-", "");
  const dnNumber = `SJ-${dateCompact}-${Date.now().toString().slice(-6)}`;

  const { data: dn, error: dnError } = await supabase
    .from("delivery_notes")
    .insert({
      business_id: businessId,
      purchase_request_id: requestId,
      dn_number: dnNumber,
      from_location_id: fromLocation.id,
      to_location_name: toLocationName,
      to_location_id: request.location_id,
      prepared_by: preparedBy.trim(),
    })
    .select("id")
    .single();
  if (dnError || !dn) return { error: dnError?.message ?? "Gagal membuat Surat Jalan." };

  const { error: itemsError } = await supabase.from("delivery_note_items").insert(
    items.map((it) => ({
      business_id: businessId,
      delivery_note_id: dn.id,
      source_type: it.sourceType,
      source_id: it.sourceId,
      item_name: it.itemName,
      unit: it.unit,
      qty: it.qty,
    })),
  );

  if (itemsError) {
    await supabase.from("delivery_notes").delete().eq("id", dn.id).eq("business_id", businessId);
    if (itemsError.code === "23505") {
      return { error: "Ada barang yang sudah masuk Surat Jalan lain. Muat ulang halaman lalu coba lagi." };
    }
    return { error: itemsError.message };
  }

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Surat Jalan dibuat: ${dnNumber}`,
    `Oleh ${preparedBy.trim()} — ${items.length} barang ke ${toLocationName}`,
  );

  revalidatePath(`/business/${businessId}/permintaan-barang/${requestId}`);
  return { error: null, deliveryNoteId: dn.id };
}
