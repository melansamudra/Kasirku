"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentActor } from "@/lib/current-actor";
import { logActivity } from "@/lib/activity-log";

export type TransferIngredientResult = { error: string | null; transferId: string | null };

// Pindahkan stok bahan baku antar-lokasi DALAM 1 bisnis yang sama (mis.
// Gudang -> Kitchen/Bar) -- bungkus RPC public.transfer_ingredient_stock
// (satu transaksi atomik: kurangi stok lokasi asal, tambah stok lokasi
// tujuan, catat stock_adjustments di kedua sisi). Sengaja tabel & RPC
// TERPISAH TOTAL dari location_transfers/fulfill_location_transfer_public
// (BSJ, sudah dipakai aktif oleh Llauk) -- lihat migration
// 20260910190000_ingredient_location_transfers.sql.
export async function transferIngredientStock(
  businessId: string,
  fromLocationId: string,
  toLocationId: string,
  items: { ingredientId: string; qty: number }[],
  note: string | null,
): Promise<TransferIngredientResult> {
  if (items.length === 0) {
    return { error: "Pilih minimal satu bahan untuk dipindahkan.", transferId: null };
  }

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang.", transferId: null };

  const { data, error } = await supabase.rpc("transfer_ingredient_stock", {
    p_business_id: businessId,
    p_from_location_id: fromLocationId,
    p_to_location_id: toLocationId,
    p_items: items.map((it) => ({ ingredient_id: it.ingredientId, qty: it.qty })),
    p_sent_by_name: actor.name,
    p_note: note,
  });

  if (error) return { error: error.message, transferId: null };

  const row = Array.isArray(data) ? data[0] : data;
  const transferId = row?.transfer_id ?? null;
  const transferNumber = row?.transfer_number ?? "";

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Transfer bahan baku: ${transferNumber}`,
    `${items.length} bahan · oleh ${actor.name}`,
  );

  revalidatePath(`/business/${businessId}/transfer-bahan-baku`);
  return { error: null, transferId };
}
