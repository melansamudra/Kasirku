"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentActor } from "@/lib/current-actor";

export type ActionState = { error: string | null };

export type ManualDnItemInput = { itemName: string; unit: string; qty: number };

// Surat Jalan MANUAL — bebas ketik tujuan + daftar barang sendiri, TIDAK
// terhubung ke PR/PO/alokasi sama sekali (beda dari `delivery_notes` yang
// otomatis dari rantai fulfillment/GRN). Dibuat karena rantai otomatis itu
// belum diuji coba untuk order-order sungguhan (arahan user 2026-08-30) —
// murni dokumen, tidak memindahkan stok apa pun.
export async function createManualDeliveryNote(
  businessId: string,
  locationId: string,
  destination: string,
  note: string,
  items: ManualDnItemInput[],
): Promise<ActionState> {
  if (!destination.trim()) return { error: "Tujuan pengiriman wajib diisi." };
  const cleanItems = items
    .map((i) => ({ itemName: i.itemName.trim(), unit: i.unit.trim(), qty: Number(i.qty) }))
    .filter((i) => i.itemName.length > 0 && i.qty > 0);
  if (cleanItems.length === 0) return { error: "Isi minimal 1 barang dengan qty > 0." };

  const supabase = await createClient();

  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const now = new Date();
  const dateCompact = now.toISOString().slice(0, 10).replaceAll("-", "");
  const dnNumber = `SJ-${dateCompact}-${Date.now().toString().slice(-6)}`;

  const { data: dn, error: dnError } = await supabase
    .from("manual_delivery_notes")
    .insert({
      business_id: businessId,
      location_id: locationId,
      dn_number: dnNumber,
      destination: destination.trim(),
      note: note.trim() || null,
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
    })
    .select("id")
    .single();
  if (dnError || !dn) return { error: dnError?.message ?? "Gagal membuat Surat Jalan." };

  const { error: itemsError } = await supabase.from("manual_delivery_note_items").insert(
    cleanItems.map((i, idx) => ({
      business_id: businessId,
      manual_delivery_note_id: dn.id,
      item_name: i.itemName,
      unit: i.unit || null,
      qty: i.qty,
      sort_order: idx,
    })),
  );
  if (itemsError) return { error: itemsError.message };

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/surat-jalan-manual`);
  return { error: null };
}
