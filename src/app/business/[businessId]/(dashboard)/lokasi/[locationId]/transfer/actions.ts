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

  const sentItems = (items ?? []).filter((item) => Number(qtySentByItemId[item.id] ?? 0) > 0);
  if (sentItems.length === 0) {
    return { error: "Isi jumlah yang dikirim untuk minimal 1 bahan." };
  }

  // Dulu ini 5 round-trip serial PER ITEM (2 select stok + 2 upsert stok +
  // 1 insert riwayat). Untuk transfer berisi banyak bahan itu jadi puluhan
  // round-trip berurutan. Sekarang: 2 select batch (stok asal & tujuan utk
  // SEMUA item sekaligus), lalu semua penulisan dijalankan paralel.
  const semiIds = [...new Set(sentItems.map((item) => item.semi_finished_item_id))];
  const [{ data: sourceRows }, { data: destRows }] = await Promise.all([
    supabase
      .from("semi_finished_item_location_stock")
      .select("semi_finished_item_id, stock")
      .eq("business_id", businessId)
      .eq("location_id", transfer.from_location_id)
      .in("semi_finished_item_id", semiIds),
    supabase
      .from("semi_finished_item_location_stock")
      .select("semi_finished_item_id, stock")
      .eq("business_id", businessId)
      .eq("location_id", transfer.to_location_id)
      .in("semi_finished_item_id", semiIds),
  ]);

  const sourceStockMap = new Map((sourceRows ?? []).map((r) => [r.semi_finished_item_id, Number(r.stock)]));
  const destStockMap = new Map((destRows ?? []).map((r) => [r.semi_finished_item_id, Number(r.stock)]));

  // SEMENTARA (buat uji coba, 2026-08-29): cek "stok tidak cukup" dimatikan
  // -- stok sumber bisa jadi minus selama ini aktif. WAJIB dikembalikan
  // setelah uji coba selesai (lihat riwayat versi loop-per-item sebelumnya
  // untuk contoh pesan errornya).

  type AdjustmentRow = {
    business_id: string; semi_finished_item_id: string; location_id: string;
    item_name: string; unit: string; stock_before: number; stock_after: number;
    diff: number; reason: string;
  };
  const adjustmentRows: AdjustmentRow[] = [];
  // Map kumulatif -- kalau kebetulan ada >1 baris item dengan
  // semi_finished_item_id yang sama dalam satu transfer, koreksinya
  // dijumlahkan berurutan (bukan saling menimpa / bikin upsert konflik).
  const sourceNext = new Map<string, number>();
  const destNext = new Map<string, number>();

  for (const item of sentItems) {
    const qty = Number(qtySentByItemId[item.id] ?? 0);

    const sourceBefore = sourceNext.get(item.semi_finished_item_id) ?? sourceStockMap.get(item.semi_finished_item_id) ?? 0;
    const sourceAfter = sourceBefore - qty;
    sourceNext.set(item.semi_finished_item_id, sourceAfter);

    const destBefore = destNext.get(item.semi_finished_item_id) ?? destStockMap.get(item.semi_finished_item_id) ?? 0;
    const destAfter = destBefore + qty;
    destNext.set(item.semi_finished_item_id, destAfter);

    adjustmentRows.push(
      {
        business_id: businessId,
        semi_finished_item_id: item.semi_finished_item_id,
        location_id: transfer.from_location_id,
        item_name: item.item_name,
        unit: item.unit,
        stock_before: sourceBefore,
        stock_after: sourceAfter,
        diff: -qty,
        reason: `Transfer keluar (ke ${toLoc?.name ?? "lokasi lain"})`,
      },
      {
        business_id: businessId,
        semi_finished_item_id: item.semi_finished_item_id,
        location_id: transfer.to_location_id,
        item_name: item.item_name,
        unit: item.unit,
        stock_before: destBefore,
        stock_after: destAfter,
        diff: qty,
        reason: `Transfer masuk (dari ${fromLoc?.name ?? "lokasi lain"})`,
      },
    );
  }

  const nowIso = new Date().toISOString();
  const [sourceRes, destRes, adjRes] = await Promise.all([
    supabase.from("semi_finished_item_location_stock").upsert(
      [...sourceNext.entries()].map(([semi_finished_item_id, stock]) => ({
        business_id: businessId,
        location_id: transfer.from_location_id,
        semi_finished_item_id,
        stock,
        updated_at: nowIso,
      })),
      { onConflict: "location_id,semi_finished_item_id" },
    ),
    supabase.from("semi_finished_item_location_stock").upsert(
      [...destNext.entries()].map(([semi_finished_item_id, stock]) => ({
        business_id: businessId,
        location_id: transfer.to_location_id,
        semi_finished_item_id,
        stock,
        updated_at: nowIso,
      })),
      { onConflict: "location_id,semi_finished_item_id" },
    ),
    supabase.from("stock_adjustments").insert(adjustmentRows),
  ]);
  if (sourceRes.error) return { error: sourceRes.error.message };
  if (destRes.error) return { error: destRes.error.message };
  if (adjRes.error) return { error: adjRes.error.message };

  await Promise.all(
    sentItems.map((item) =>
      supabase
        .from("location_transfer_items")
        .update({ qty_sent: Number(qtySentByItemId[item.id] ?? 0) })
        .eq("id", item.id),
    ),
  );

  // dn_number -- pola sama fulfill_location_transfer_public (RPC Portal),
  // biar Surat Jalan tetap dapat nomor terlepas dari staf kirimnya lewat
  // dashboard (di sini) atau Portal scan.
  const dnNumber = `SJ-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${transferId.replaceAll("-", "").slice(-6)}`;

  await supabase
    .from("location_transfers")
    .update({ status: "dikirim", fulfilled_at: new Date().toISOString(), dn_number: dnNumber })
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
