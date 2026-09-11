"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ActionState = { error: string | null };

// Kitchen/Bar ajukan permintaan ke satu Gudang standalone -- murni catatan
// (tidak menyentuh stok sama sekali), Gudang yang nanti milah-milah lewat
// createWarehouseDeliveryNote. Lihat catatan migrasi
// warehouse_requests_and_delivery_notes kenapa ini tabel baru terpisah.
export async function submitWarehouseRequest(
  businessId: string,
  fromLocationId: string,
  toLocationId: string,
  requestedByName: string,
  note: string,
  items: { name: string; unit: string; qty: number }[],
): Promise<ActionState> {
  requestedByName = requestedByName.trim();
  if (!requestedByName) return { error: "Nama pemohon wajib diisi." };
  const cleanItems = items
    .map((it) => ({ name: it.name.trim(), unit: it.unit.trim(), qty: Number(it.qty) }))
    .filter((it) => it.name && it.qty > 0);
  if (cleanItems.length === 0) return { error: "Isi minimal satu barang dengan qty > 0." };

  const supabase = await createClient();

  const { count } = await supabase
    .from("warehouse_requests")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", new Date().toISOString().slice(0, 10));
  const requestNumber = `PG-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: request, error } = await supabase
    .from("warehouse_requests")
    .insert({
      business_id: businessId,
      request_number: requestNumber,
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      requested_by_name: requestedByName,
      note: note.trim() || null,
    })
    .select("id")
    .single();

  if (error || !request) return { error: error?.message ?? "Gagal membuat permintaan." };

  const { error: itemsError } = await supabase.from("warehouse_request_items").insert(
    cleanItems.map((it) => ({
      warehouse_request_id: request.id,
      business_id: businessId,
      item_name: it.name,
      unit: it.unit || null,
      qty_requested: it.qty,
    })),
  );
  if (itemsError) return { error: itemsError.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "info",
    `Permintaan Gudang ${requestNumber} diajukan`,
    `${cleanItems.length} barang · oleh ${requestedByName}`,
  );

  revalidatePath(`/business/${businessId}/lokasi/${toLocationId}/permintaan-gudang`);
  revalidatePath(`/business/${businessId}/lokasi/${fromLocationId}/permintaan-gudang`);
  return { error: null };
}

export type CreateDeliveryNoteState = { error: string | null; dnId: string | null };

// Gudang kirim barang -- 1 langkah atomik lewat RPC (kurangi stok
// warehouse_items, catat stock_adjustments, bikin Surat Jalan). Tidak ada
// penambahan stok otomatis di sisi penerima -- itu langkah manual terpisah
// (receiveWarehouseDeliveryNoteItem).
export async function createWarehouseDeliveryNote(
  businessId: string,
  fromLocationId: string,
  toLocationId: string,
  preparedBy: string,
  note: string,
  warehouseRequestId: string | null,
  items: { warehouseItemId: string; requestItemId: string | null; qty: number }[],
): Promise<CreateDeliveryNoteState> {
  preparedBy = preparedBy.trim();
  if (!preparedBy) return { error: "Nama yang menyiapkan wajib diisi.", dnId: null };
  const cleanItems = items.filter((it) => it.warehouseItemId && Number(it.qty) > 0);
  if (cleanItems.length === 0) return { error: "Pilih minimal satu barang dengan qty > 0.", dnId: null };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_warehouse_delivery_note", {
    p_business_id: businessId,
    p_from_location_id: fromLocationId,
    p_to_location_id: toLocationId,
    p_prepared_by: preparedBy,
    p_items: cleanItems.map((it) => ({
      warehouse_item_id: it.warehouseItemId,
      request_item_id: it.requestItemId,
      qty: it.qty,
    })),
    p_warehouse_request_id: warehouseRequestId,
    p_note: note.trim() || null,
  });

  if (error) return { error: error.message, dnId: null };

  const row = Array.isArray(data) ? data[0] : data;
  const dnId = row?.delivery_note_id ?? null;
  const dnNumber = row?.dn_number ?? "";

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Surat Jalan Gudang ${dnNumber} dibuat`,
    `${cleanItems.length} barang · oleh ${preparedBy}`,
  );

  revalidatePath(`/business/${businessId}/lokasi/${fromLocationId}/permintaan-gudang`);
  revalidatePath(`/business/${businessId}/lokasi/${fromLocationId}/bahan-baku`);
  revalidatePath(`/business/${businessId}/lokasi/${toLocationId}/permintaan-gudang`);
  return { error: null, dnId };
}

// Kitchen/Bar terima Surat Jalan -- STAF YANG PILIH sendiri bahan master
// mana yang cocok & berapa qty yang mau ditambahkan ke stok lokasi mereka
// (bukan auto-copy qty dari Surat Jalan), karena nama/satuan barang Gudang
// belum tentu sama persis dengan ingredient Kitchen/Bar. Sama pola dengan
// adjustIngredientLocationStock, tapi ini DELTA nambah (barang masuk),
// bukan set ke angka fisik absolut.
export async function receiveWarehouseDeliveryNoteItem(
  businessId: string,
  dnItemId: string,
  toLocationId: string,
  ingredientId: string,
  addQty: number,
  receivedBy: string,
): Promise<ActionState> {
  if (Number.isNaN(addQty) || addQty <= 0) {
    return { error: "Qty yang ditambahkan harus lebih dari 0." };
  }
  receivedBy = receivedBy.trim();
  if (!receivedBy) return { error: "Nama penerima wajib diisi." };

  const supabase = await createClient();

  const [{ data: dnItem }, { data: ingredient }] = await Promise.all([
    supabase
      .from("warehouse_delivery_note_items")
      .select("id, item_name, delivery_note_id, received_at")
      .eq("id", dnItemId)
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("ingredients")
      .select("id, name, unit")
      .eq("id", ingredientId)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (!dnItem) return { error: "Item Surat Jalan tidak ditemukan." };
  if (dnItem.received_at) return { error: "Item ini sudah pernah ditambahkan ke stok." };
  if (!ingredient) return { error: "Bahan baku tidak ditemukan." };

  const { data: existingRow } = await supabase
    .from("ingredient_location_stock")
    .select("id, stock")
    .eq("location_id", toLocationId)
    .eq("ingredient_id", ingredientId)
    .maybeSingle();

  const stockBefore = Number(existingRow?.stock ?? 0);
  const stockAfter = stockBefore + addQty;

  if (existingRow) {
    await supabase.from("ingredient_location_stock").update({ stock: stockAfter, updated_at: new Date().toISOString() }).eq("id", existingRow.id);
  } else {
    await supabase.from("ingredient_location_stock").insert({
      business_id: businessId,
      location_id: toLocationId,
      ingredient_id: ingredientId,
      stock: stockAfter,
    });
  }

  const { data: dn } = await supabase
    .from("warehouse_delivery_notes")
    .select("dn_number")
    .eq("id", dnItem.delivery_note_id)
    .single();

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    ingredient_id: ingredientId,
    location_id: toLocationId,
    item_name: ingredient.name,
    unit: ingredient.unit,
    stock_before: stockBefore,
    stock_after: stockAfter,
    diff: addQty,
    reason: `Terima dari Surat Jalan ${dn?.dn_number ?? ""} (${dnItem.item_name}), oleh ${receivedBy}`,
  });

  await supabase
    .from("warehouse_delivery_note_items")
    .update({
      received_ingredient_id: ingredientId,
      received_qty: addQty,
      received_at: new Date().toISOString(),
      received_by: receivedBy,
    })
    .eq("id", dnItemId);

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Stok ${ingredient.name} ditambah dari Surat Jalan`,
    `+${addQty} ${ingredient.unit} · oleh ${receivedBy}`,
  );

  revalidatePath(`/business/${businessId}/lokasi/${toLocationId}/permintaan-gudang`);
  revalidatePath(`/business/${businessId}/lokasi/${toLocationId}/bahan-baku`);
  return { error: null };
}
