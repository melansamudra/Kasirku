"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentActor } from "@/lib/current-actor";
import { logActivity } from "@/lib/activity-log";

export type ShipTransferResult = { error: string | null; transferId: string | null };

// Kirim stok dari bisnis ini ke bisnis lain (owner sama, mis. Gudang Central
// -> Llauk/PASTRI/Dapur Produksi) -- bungkus RPC public.ship_inter_unit_transfer
// (satu transaksi atomik: kurangi stok pengirim, tambah stok penerima, posting
// Piutang/Hutang Antar-Unit di kedua sisi). Lihat migration
// 20260907130000_inter_unit_transfers.sql.
export async function shipInterUnitTransfer(
  businessId: string,
  toBusinessId: string,
  fromLocationId: string,
  toLocationId: string,
  items: { ingredientId: string; qty: number }[],
  note: string | null,
): Promise<ShipTransferResult> {
  if (items.length === 0) {
    return { error: "Pilih minimal satu bahan untuk dikirim.", transferId: null };
  }

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang.", transferId: null };

  const { data, error } = await supabase.rpc("ship_inter_unit_transfer", {
    p_from_business_id: businessId,
    p_to_business_id: toBusinessId,
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
    `Kirim antar-unit: ${transferNumber}`,
    `${items.length} bahan · oleh ${actor.name}`,
  );

  revalidatePath(`/business/${businessId}/inter-unit-transfers`);
  revalidatePath(`/business/${toBusinessId}/inter-unit-transfers`);
  return { error: null, transferId };
}
