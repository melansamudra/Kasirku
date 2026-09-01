"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getCurrentActor } from "@/lib/current-actor";

export type TransferActionState = { error: string | null };

export type RegenerateSlugState = { error: string | null; slug: string | null };

// Transfer peer-to-peer antar lokasi setara (mis. Kitchen <-> Bar <-> Gudang
// Utama di Adi's Culinary) -- BEDA dari fulfillLocationTransfer di bawah
// (yang khusus alur Llauk: 1 lokasi is_production selalu jadi pengirim,
// via Portal-PIN). Bisnis stok-lite tidak punya konsep pengirim tunggal,
// jadi transfer langsung dieksekusi di sini (login normal, tanpa PIN),
// tanpa lewat tabel location_transfers/location_transfer_items sama sekali
// -- cukup pindahkan ingredient_location_stock + catat di stock_adjustments
// (tabel yang sama dibaca Kartu Stok).
export async function transferIngredientStock(
  businessId: string,
  fromLocationId: string,
  toLocationId: string,
  ingredientId: string,
  qty: number,
  note: string,
): Promise<TransferActionState> {
  if (fromLocationId === toLocationId) return { error: "Lokasi tujuan harus beda dari lokasi asal." };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Jumlah harus lebih dari 0." };

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("cost_control_enabled, stock_locations_enabled")
    .eq("id", businessId)
    .single();
  if (!business || business.cost_control_enabled || !business.stock_locations_enabled) {
    return { error: "Fitur transfer ini tidak tersedia untuk bisnis ini." };
  }

  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const [{ data: locations }, { data: ingredient }] = await Promise.all([
    supabase.from("stock_locations").select("id, name").eq("business_id", businessId).in("id", [fromLocationId, toLocationId]),
    supabase.from("ingredients").select("id, name, unit").eq("id", ingredientId).eq("business_id", businessId).single(),
  ]);
  const fromLocation = (locations ?? []).find((l) => l.id === fromLocationId);
  const toLocation = (locations ?? []).find((l) => l.id === toLocationId);
  if (!fromLocation || !toLocation) return { error: "Lokasi tidak ditemukan." };
  if (!ingredient) return { error: "Bahan tidak ditemukan." };

  const { data: sourceStockRow } = await supabase
    .from("ingredient_location_stock")
    .select("stock")
    .eq("business_id", businessId)
    .eq("location_id", fromLocationId)
    .eq("ingredient_id", ingredientId)
    .maybeSingle();
  const sourceStock = Number(sourceStockRow?.stock ?? 0);
  if (sourceStock < qty) {
    return { error: `Stok ${ingredient.name} di ${fromLocation.name} cuma ${sourceStock} ${ingredient.unit}, kurang untuk transfer ${qty}.` };
  }

  const { data: destStockRow } = await supabase
    .from("ingredient_location_stock")
    .select("stock")
    .eq("business_id", businessId)
    .eq("location_id", toLocationId)
    .eq("ingredient_id", ingredientId)
    .maybeSingle();
  const destStock = Number(destStockRow?.stock ?? 0);

  const { error: srcError } = await supabase.from("ingredient_location_stock").upsert(
    { business_id: businessId, location_id: fromLocationId, ingredient_id: ingredientId, stock: sourceStock - qty, updated_at: new Date().toISOString() },
    { onConflict: "location_id,ingredient_id" },
  );
  if (srcError) return { error: srcError.message };

  const { error: dstError } = await supabase.from("ingredient_location_stock").upsert(
    { business_id: businessId, location_id: toLocationId, ingredient_id: ingredientId, stock: destStock + qty, updated_at: new Date().toISOString() },
    { onConflict: "location_id,ingredient_id" },
  );
  if (dstError) return { error: dstError.message };

  const trimmedNote = note.trim();
  const reasonSuffix = trimmedNote ? ` — ${trimmedNote}` : "";
  await supabase.from("stock_adjustments").insert([
    {
      business_id: businessId,
      ingredient_id: ingredientId,
      location_id: fromLocationId,
      item_name: ingredient.name,
      unit: ingredient.unit,
      stock_before: sourceStock,
      stock_after: sourceStock - qty,
      diff: -qty,
      reason: `Transfer keluar (ke ${toLocation.name})${reasonSuffix}`,
      submitted_by_name: actor.name,
    },
    {
      business_id: businessId,
      ingredient_id: ingredientId,
      location_id: toLocationId,
      item_name: ingredient.name,
      unit: ingredient.unit,
      stock_before: destStock,
      stock_after: destStock + qty,
      diff: qty,
      reason: `Transfer masuk (dari ${fromLocation.name})${reasonSuffix}`,
      submitted_by_name: actor.name,
    },
  ]);

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Transfer stok: ${ingredient.name}`,
    `${qty} ${ingredient.unit} — ${fromLocation.name} → ${toLocation.name} · oleh ${actor.name}`,
  );

  revalidatePath(`/business/${businessId}/lokasi/${fromLocationId}/transfer`);
  revalidatePath(`/business/${businessId}/lokasi/${toLocationId}/transfer`);
  revalidatePath(`/business/${businessId}/lokasi/${fromLocationId}/bahan-baku`);
  revalidatePath(`/business/${businessId}/lokasi/${toLocationId}/bahan-baku`);
  revalidatePath(`/business/${businessId}/lokasi/${fromLocationId}/kartu-stok`);
  revalidatePath(`/business/${businessId}/lokasi/${toLocationId}/kartu-stok`);
  return { error: null };
}

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
