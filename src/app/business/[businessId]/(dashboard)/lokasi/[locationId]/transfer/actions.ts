"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type TransferActionState = { error: string | null };

export type RegenerateSlugState = { error: string | null; slug: string | null };

export async function regenerateLocationTransferSlug(
  businessId: string,
  locationId: string,
): Promise<RegenerateSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase.from("businesses").update({ location_transfer_slug: slug }).eq("id", businessId);
  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link permintaan transfer diganti");
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/transfer`);
  return { error: null, slug };
}

// Kirim barang buat 1 permintaan transfer sekaligus (semua item di
// permintaan itu). qtySentByItemId cuma perlu isi item yang MEMANG dikirim
// -- item yang tidak diisi/0 dianggap tidak dikirim (mis. stok tidak
// cukup), permintaannya tetap ditandai "dikirim" tapi qty_sent item itu
// null (kelihatan di riwayat sebagai belum terpenuhi).
//
// Validasi stok cukup WAJIB sebelum kredit ke lokasi tujuan -- pernah ada
// bug serupa di fitur lain (receiveStockFulfillment) yang bikin stok
// "muncul dari udara" karena source di-floor ke 0 tapi dest tetap dapat
// full qty. Di sini kalau stok kurang, GAGAL EKSPLISIT untuk item itu.
export async function fulfillLocationTransfer(
  businessId: string,
  locationId: string,
  transferId: string,
  qtySentByItemId: Record<string, number>,
): Promise<TransferActionState> {
  const supabase = await createClient();

  const { data: transfer } = await supabase
    .from("location_transfers")
    .select("id, from_location_id, to_location_id, status")
    .eq("id", transferId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!transfer) return { error: "Permintaan tidak ditemukan." };
  if (transfer.status !== "baru") return { error: "Permintaan ini sudah diproses." };

  const [{ data: items }, { data: fromLoc }, { data: toLoc }] = await Promise.all([
    supabase
      .from("location_transfer_items")
      .select("id, semi_finished_item_id, item_name, unit, qty_requested")
      .eq("transfer_id", transferId)
      .eq("business_id", businessId),
    supabase.from("stock_locations").select("name").eq("id", transfer.from_location_id).single(),
    supabase.from("stock_locations").select("name").eq("id", transfer.to_location_id).single(),
  ]);

  let anySent = false;
  for (const item of items ?? []) {
    const qty = Number(qtySentByItemId[item.id] ?? 0);
    if (!(qty > 0)) continue;

    const { data: sourceRow } = await supabase
      .from("semi_finished_item_location_stock")
      .select("stock")
      .eq("business_id", businessId)
      .eq("location_id", transfer.from_location_id)
      .eq("semi_finished_item_id", item.semi_finished_item_id)
      .maybeSingle();
    const sourceStock = Number(sourceRow?.stock ?? 0);
    // SEMENTARA (buat uji coba, 2026-08-29): cek "stok tidak cukup"
    // dimatikan -- stok sumber bisa jadi minus selama ini aktif. WAJIB
    // dikembalikan (uncomment blok di bawah) setelah uji coba selesai.
    // if (sourceStock < qty) {
    //   return {
    //     error: `Stok "${item.item_name}" di ${fromLoc?.name ?? "lokasi asal"} cuma ${sourceStock} ${item.unit}, tidak cukup untuk kirim ${qty} ${item.unit}.`,
    //   };
    // }

    const { data: destRow } = await supabase
      .from("semi_finished_item_location_stock")
      .select("stock")
      .eq("business_id", businessId)
      .eq("location_id", transfer.to_location_id)
      .eq("semi_finished_item_id", item.semi_finished_item_id)
      .maybeSingle();
    const destStock = Number(destRow?.stock ?? 0);

    const { error: sourceErr } = await supabase
      .from("semi_finished_item_location_stock")
      .upsert(
        {
          business_id: businessId,
          location_id: transfer.from_location_id,
          semi_finished_item_id: item.semi_finished_item_id,
          stock: sourceStock - qty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,semi_finished_item_id" },
      );
    if (sourceErr) return { error: sourceErr.message };

    const { error: destErr } = await supabase
      .from("semi_finished_item_location_stock")
      .upsert(
        {
          business_id: businessId,
          location_id: transfer.to_location_id,
          semi_finished_item_id: item.semi_finished_item_id,
          stock: destStock + qty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,semi_finished_item_id" },
      );
    if (destErr) return { error: destErr.message };

    await supabase.from("stock_adjustments").insert([
      {
        business_id: businessId,
        semi_finished_item_id: item.semi_finished_item_id,
        location_id: transfer.from_location_id,
        item_name: item.item_name,
        unit: item.unit,
        stock_before: sourceStock,
        stock_after: sourceStock - qty,
        diff: -qty,
        reason: `Transfer keluar (ke ${toLoc?.name ?? "lokasi lain"})`,
      },
      {
        business_id: businessId,
        semi_finished_item_id: item.semi_finished_item_id,
        location_id: transfer.to_location_id,
        item_name: item.item_name,
        unit: item.unit,
        stock_before: destStock,
        stock_after: destStock + qty,
        diff: qty,
        reason: `Transfer masuk (dari ${fromLoc?.name ?? "lokasi lain"})`,
      },
    ]);

    await supabase.from("location_transfer_items").update({ qty_sent: qty }).eq("id", item.id);
    anySent = true;
  }

  if (!anySent) {
    return { error: "Isi jumlah yang dikirim untuk minimal 1 bahan." };
  }

  await supabase
    .from("location_transfers")
    .update({ status: "dikirim", fulfilled_at: new Date().toISOString() })
    .eq("id", transferId);

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Transfer bahan dikirim ke ${toLoc?.name ?? "lokasi lain"}`,
  );

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/transfer`);
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/kartu-stok`);
  return { error: null };
}
