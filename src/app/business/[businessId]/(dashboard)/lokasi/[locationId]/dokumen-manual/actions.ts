"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentActor } from "@/lib/current-actor";

export type ActionState = { error: string | null };

export type ManualDocItemInput = { itemName: string; unit: string; qty: number };

function cleanItems(items: ManualDocItemInput[]) {
  return items
    .map((i) => ({ itemName: i.itemName.trim(), unit: i.unit.trim(), qty: Number(i.qty) }))
    .filter((i) => i.itemName.length > 0 && i.qty > 0);
}

function docNumber(prefix: string) {
  const dateCompact = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${dateCompact}-${Date.now().toString().slice(-6)}`;
}

// Surat Jalan MANUAL — bebas ketik tujuan + daftar barang sendiri, TIDAK
// terhubung ke PR/PO/alokasi sama sekali (beda dari `delivery_notes` yang
// otomatis dari rantai fulfillment/GRN). Murni dokumen, tidak memindahkan
// stok apa pun.
export async function createManualDeliveryNote(
  businessId: string,
  locationId: string,
  destination: string,
  note: string,
  items: ManualDocItemInput[],
): Promise<ActionState> {
  if (!destination.trim()) return { error: "Tujuan pengiriman wajib diisi." };
  const cleanRows = cleanItems(items);
  if (cleanRows.length === 0) return { error: "Isi minimal 1 barang dengan qty > 0." };

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const { data: dn, error: dnError } = await supabase
    .from("manual_delivery_notes")
    .insert({
      business_id: businessId,
      location_id: locationId,
      dn_number: docNumber("SJ"),
      destination: destination.trim(),
      note: note.trim() || null,
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
    })
    .select("id")
    .single();
  if (dnError || !dn) return { error: dnError?.message ?? "Gagal membuat Surat Jalan." };

  const { error: itemsError } = await supabase.from("manual_delivery_note_items").insert(
    cleanRows.map((i, idx) => ({
      business_id: businessId,
      manual_delivery_note_id: dn.id,
      item_name: i.itemName,
      unit: i.unit || null,
      qty: i.qty,
      sort_order: idx,
    })),
  );
  if (itemsError) {
    // Header sudah kesave tanpa item -- hapus lagi supaya tidak nyangkut
    // dokumen kosong yang bikin bingung riwayat (pola sama grn-actions.ts).
    await supabase.from("manual_delivery_notes").delete().eq("id", dn.id).eq("business_id", businessId);
    return { error: itemsError.message };
  }

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/dokumen-manual`);
  return { error: null };
}

// Permintaan Barang MANUAL — bebas ketik daftar barang, TIDAK terhubung ke
// purchase_requests/alokasi/budget-gate. Jalur cadangan selama alur digital
// berlapis itu belum terbukti jalan mulus.
export async function createManualPurchaseRequest(
  businessId: string,
  locationId: string,
  note: string,
  items: ManualDocItemInput[],
): Promise<ActionState> {
  const cleanRows = cleanItems(items);
  if (cleanRows.length === 0) return { error: "Isi minimal 1 barang dengan qty > 0." };

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const { data: pr, error: prError } = await supabase
    .from("manual_purchase_requests")
    .insert({
      business_id: businessId,
      location_id: locationId,
      pr_number: docNumber("PR"),
      note: note.trim() || null,
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
    })
    .select("id")
    .single();
  if (prError || !pr) return { error: prError?.message ?? "Gagal membuat Permintaan Barang." };

  const { error: itemsError } = await supabase.from("manual_purchase_request_items").insert(
    cleanRows.map((i, idx) => ({
      business_id: businessId,
      manual_purchase_request_id: pr.id,
      item_name: i.itemName,
      unit: i.unit || null,
      qty: i.qty,
      sort_order: idx,
    })),
  );
  if (itemsError) {
    await supabase.from("manual_purchase_requests").delete().eq("id", pr.id).eq("business_id", businessId);
    return { error: itemsError.message };
  }

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/dokumen-manual`);
  return { error: null };
}

// Stock Opname MANUAL — catat hasil hitung fisik apa adanya, TIDAK
// dibandingkan ke stok sistem (`ingredient_location_stock`/dst) sama sekali
// dan tidak mengoreksi stok apa pun. Jalur cadangan kalau data stok digital
// belum akurat/lengkap.
export async function createManualStockOpname(
  businessId: string,
  locationId: string,
  note: string,
  items: ManualDocItemInput[],
): Promise<ActionState> {
  const cleanRows = cleanItems(items);
  if (cleanRows.length === 0) return { error: "Isi minimal 1 barang dengan qty > 0." };

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const { data: op, error: opError } = await supabase
    .from("manual_stock_opnames")
    .insert({
      business_id: businessId,
      location_id: locationId,
      opname_number: docNumber("SO"),
      note: note.trim() || null,
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
    })
    .select("id")
    .single();
  if (opError || !op) return { error: opError?.message ?? "Gagal membuat Stock Opname." };

  const { error: itemsError } = await supabase.from("manual_stock_opname_items").insert(
    cleanRows.map((i, idx) => ({
      business_id: businessId,
      manual_stock_opname_id: op.id,
      item_name: i.itemName,
      unit: i.unit || null,
      qty: i.qty,
      sort_order: idx,
    })),
  );
  if (itemsError) {
    await supabase.from("manual_stock_opnames").delete().eq("id", op.id).eq("business_id", businessId);
    return { error: itemsError.message };
  }

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/dokumen-manual`);
  return { error: null };
}
