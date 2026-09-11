"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getCurrentActor } from "@/lib/current-actor";

export type RegenerateSlugState = { error: string | null; slug: string | null };

export async function regenerateStockOpnameSlug(
  businessId: string,
  locationId: string,
): Promise<RegenerateSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase.from("businesses").update({ stock_opname_slug: slug }).eq("id", businessId);

  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link stok opname diganti");
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/stock-opname`);
  return { error: null, slug };
}

export type OpnameActionState = { error: string | null };

// Titik SATU-SATUNYA di mana laporan stok opname staf benar-benar
// mengubah stok sistem. Koreksinya = reported_stock - system_stock_at_report
// (selisih hasil hitung fisik terhadap stok sistem SAAT opname dilakukan),
// lalu ditambahkan ke stok TERKINI (live) -- bukan menimpa stok terkini
// dengan reported_stock secara mentah. Kalau verifikasi telat (mis. opname
// tanggal 1 tapi baru diverifikasi tanggal 7) dan ada pergerakan stok lain
// di antaranya (pembelian masuk, pemakaian, opname lain), pergerakan itu
// tetap terjaga -- yang diterapkan cuma selisih temuan opname itu sendiri.
async function applyOpnameEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  entry: {
    id: string;
    component_type: string;
    ingredient_id: string | null;
    semi_finished_item_id: string | null;
    warehouse_item_id: string | null;
    location_id: string;
    item_name: string;
    unit: string;
    reported_stock: number;
    system_stock_at_report: number;
    submitted_by_name: string;
  },
): Promise<string | null> {
  let currentStock = 0;
  if (entry.component_type === "ingredient") {
    const { data: row } = await supabase
      .from("ingredient_location_stock")
      .select("stock")
      .eq("business_id", businessId)
      .eq("location_id", entry.location_id)
      .eq("ingredient_id", entry.ingredient_id as string)
      .maybeSingle();
    currentStock = Number(row?.stock ?? 0);
  } else if (entry.component_type === "semi_finished") {
    const { data: row } = await supabase
      .from("semi_finished_item_location_stock")
      .select("stock")
      .eq("business_id", businessId)
      .eq("location_id", entry.location_id)
      .eq("semi_finished_item_id", entry.semi_finished_item_id as string)
      .maybeSingle();
    currentStock = Number(row?.stock ?? 0);
  } else {
    const { data: row } = await supabase
      .from("warehouse_items")
      .select("stock")
      .eq("business_id", businessId)
      .eq("id", entry.warehouse_item_id as string)
      .maybeSingle();
    currentStock = Number(row?.stock ?? 0);
  }

  const correction = Number(entry.reported_stock) - Number(entry.system_stock_at_report);
  if (correction !== 0) {
    const newStock = currentStock + correction;
    if (entry.component_type === "ingredient") {
      const { error } = await supabase.from("ingredient_location_stock").upsert(
        {
          business_id: businessId,
          location_id: entry.location_id,
          ingredient_id: entry.ingredient_id as string,
          stock: newStock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,ingredient_id" },
      );
      if (error) return error.message;
    } else if (entry.component_type === "semi_finished") {
      const { error } = await supabase.from("semi_finished_item_location_stock").upsert(
        {
          business_id: businessId,
          location_id: entry.location_id,
          semi_finished_item_id: entry.semi_finished_item_id as string,
          stock: newStock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,semi_finished_item_id" },
      );
      if (error) return error.message;
    } else {
      const { error } = await supabase
        .from("warehouse_items")
        .update({ stock: newStock, updated_at: new Date().toISOString() })
        .eq("id", entry.warehouse_item_id as string)
        .eq("business_id", businessId);
      if (error) return error.message;
    }

    const { error: adjError } = await supabase.from("stock_adjustments").insert({
      business_id: businessId,
      ingredient_id: entry.component_type === "ingredient" ? entry.ingredient_id : null,
      semi_finished_item_id: entry.component_type === "semi_finished" ? entry.semi_finished_item_id : null,
      warehouse_item_id: entry.component_type === "warehouse_item" ? entry.warehouse_item_id : null,
      location_id: entry.location_id,
      item_name: entry.item_name,
      unit: entry.unit,
      stock_before: currentStock,
      stock_after: newStock,
      diff: correction,
      reason: "Stok opname",
      submitted_by_name: entry.submitted_by_name,
    });
    if (adjError) return adjError.message;
  }

  return null;
}

// Submission langsung dari dashboard (login normal, bukan Portal-PIN) untuk
// bisnis stok-lite (mis. Adi's Culinary) yang tidak pakai Portal Lokasi.
// Insert ke stock_opname_entries dengan status='pending' -- alur verifikasi
// (applyOpnameEntry dkk di atas) dipakai apa adanya tanpa perubahan.
export async function submitLocationStockOpnameDirect(
  businessId: string,
  locationId: string,
  counts: { itemId: string; itemName: string; unit: string; reportedStock: number }[],
  entryDate: string,
): Promise<OpnameActionState> {
  if (counts.length === 0) return { error: "Belum ada bahan yang diisi." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return { error: "Tanggal opname tidak valid." };

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const ingredientIds = counts.map((c) => c.itemId);
  const { data: stockRows } = await supabase
    .from("ingredient_location_stock")
    .select("ingredient_id, stock")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .in("ingredient_id", ingredientIds);
  const stockByIngredient = new Map((stockRows ?? []).map((r) => [r.ingredient_id, Number(r.stock)]));

  const rows = counts.map((c) => ({
    business_id: businessId,
    location_id: locationId,
    component_type: "ingredient" as const,
    ingredient_id: c.itemId,
    item_name: c.itemName,
    unit: c.unit,
    reported_stock: c.reportedStock,
    system_stock_at_report: stockByIngredient.get(c.itemId) ?? 0,
    submitted_by_name: actor.name,
    entry_date: entryDate,
  }));

  const { error } = await supabase.from("stock_opname_entries").insert(rows);
  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    "Stok opname diajukan",
    `${counts.length} bahan · oleh ${actor.name}`,
  );
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/stock-opname`);
  return { error: null };
}

// Sama pola dengan submitLocationStockOpnameDirect, tapi target
// warehouse_items (Gudang standalone) -- lihat migrasi
// warehouse_stock_opname kenapa ini numpang di stock_opname_entries yang
// sama (component_type='warehouse_item'), bukan tabel/alur verifikasi baru.
export async function submitWarehouseStockOpnameDirect(
  businessId: string,
  locationId: string,
  counts: { itemId: string; itemName: string; unit: string; reportedStock: number }[],
  entryDate: string,
): Promise<OpnameActionState> {
  if (counts.length === 0) return { error: "Belum ada barang yang diisi." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return { error: "Tanggal opname tidak valid." };

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const itemIds = counts.map((c) => c.itemId);
  const { data: itemRows } = await supabase
    .from("warehouse_items")
    .select("id, stock")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .in("id", itemIds);
  const stockByItem = new Map((itemRows ?? []).map((r) => [r.id, Number(r.stock)]));

  const rows = counts.map((c) => ({
    business_id: businessId,
    location_id: locationId,
    component_type: "warehouse_item" as const,
    warehouse_item_id: c.itemId,
    item_name: c.itemName,
    unit: c.unit,
    reported_stock: c.reportedStock,
    system_stock_at_report: stockByItem.get(c.itemId) ?? 0,
    submitted_by_name: actor.name,
    entry_date: entryDate,
  }));

  const { error } = await supabase.from("stock_opname_entries").insert(rows);
  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    "Stok opname Gudang diajukan",
    `${counts.length} barang · oleh ${actor.name}`,
  );
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/stock-opname`);
  return { error: null };
}

export async function verifyStockOpnameEntry(
  businessId: string,
  locationId: string,
  entryId: string,
): Promise<OpnameActionState> {
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("stock_opname_entries")
    .select("*")
    .eq("id", entryId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!entry) return { error: "Data tidak ditemukan." };
  if (entry.status !== "pending") return { error: "Sudah diproses sebelumnya." };

  const applyError = await applyOpnameEntry(supabase, businessId, entry);
  if (applyError) return { error: applyError };

  const { error } = await supabase
    .from("stock_opname_entries")
    .update({ status: "verified", verified_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/stock-opname`);
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/kartu-stok`);
  return { error: null };
}

export async function rejectStockOpnameEntry(
  businessId: string,
  locationId: string,
  entryId: string,
): Promise<OpnameActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("stock_opname_entries")
    .update({ status: "rejected", verified_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("business_id", businessId)
    .eq("status", "pending");
  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/stock-opname`);
  return { error: null };
}

// Verifikasi semua laporan pending sekaligus (1 tanggal) -- staf bisa
// submit puluhan bahan sekali jalan, admin tidak perlu klik satu-satu
// kalau memang mau terima semuanya apa adanya.
export async function verifyAllPendingForDate(
  businessId: string,
  locationId: string,
  entryDate: string,
): Promise<OpnameActionState> {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("stock_opname_entries")
    .select("*")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .eq("entry_date", entryDate)
    .eq("status", "pending");

  for (const entry of entries ?? []) {
    const applyError = await applyOpnameEntry(supabase, businessId, entry);
    if (applyError) return { error: applyError };
    await supabase
      .from("stock_opname_entries")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .eq("id", entry.id);
  }

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/stock-opname`);
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/kartu-stok`);
  return { error: null };
}

// Koreksi cepat langsung dari tab Nilai Persediaan (stok DAN/ATAU satuan) --
// dipakai kalau angka dari import/opname ternyata salah label satuan (mis.
// "1500 KG" yang sebenarnya "1500 gr"), tanpa harus keluar ke halaman lain.
// Cuma jalan buat tanggal HARI INI (nilai di tanggal lampau itu hasil hitung
// mundur, bukan baris yang bisa ditimpa langsung).
export async function adjustNilaiPersediaanItem(
  businessId: string,
  locationId: string,
  itemType: "ingredient" | "warehouse_item",
  itemId: string,
  newStock: number,
  newUnit: string,
): Promise<OpnameActionState> {
  if (Number.isNaN(newStock) || newStock < 0) {
    return { error: "Stok harus angka dan tidak boleh negatif." };
  }
  newUnit = newUnit.trim();
  if (!newUnit) return { error: "Satuan wajib diisi." };

  const supabase = await createClient();

  if (itemType === "ingredient") {
    const [{ data: ingredient }, { data: stockRow }] = await Promise.all([
      supabase.from("ingredients").select("id, name, unit").eq("id", itemId).eq("business_id", businessId).maybeSingle(),
      supabase
        .from("ingredient_location_stock")
        .select("id, stock")
        .eq("location_id", locationId)
        .eq("ingredient_id", itemId)
        .maybeSingle(),
    ]);
    if (!ingredient) return { error: "Bahan baku tidak ditemukan." };

    if (newUnit !== ingredient.unit) {
      await supabase.from("ingredients").update({ unit: newUnit }).eq("id", itemId);
    }

    const stockBefore = Number(stockRow?.stock ?? 0);
    if (Math.abs(newStock - stockBefore) > 1e-9) {
      if (stockRow) {
        await supabase.from("ingredient_location_stock").update({ stock: newStock, updated_at: new Date().toISOString() }).eq("id", stockRow.id);
      } else {
        await supabase.from("ingredient_location_stock").insert({ business_id: businessId, location_id: locationId, ingredient_id: itemId, stock: newStock });
      }
      await supabase.from("stock_adjustments").insert({
        business_id: businessId, ingredient_id: itemId, location_id: locationId,
        item_name: ingredient.name, unit: newUnit,
        stock_before: stockBefore, stock_after: newStock, diff: newStock - stockBefore,
        reason: "Koreksi dari Nilai Persediaan",
      });
    }
  } else {
    const { data: item } = await supabase
      .from("warehouse_items")
      .select("id, name, unit, stock")
      .eq("id", itemId)
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (!item) return { error: "Barang Gudang tidak ditemukan." };

    const stockBefore = Number(item.stock);
    const changed = newUnit !== item.unit || Math.abs(newStock - stockBefore) > 1e-9;
    if (changed) {
      await supabase.from("warehouse_items").update({ unit: newUnit, stock: newStock, updated_at: new Date().toISOString() }).eq("id", itemId);
    }
    if (Math.abs(newStock - stockBefore) > 1e-9) {
      await supabase.from("stock_adjustments").insert({
        business_id: businessId, warehouse_item_id: itemId, location_id: locationId,
        item_name: item.name, unit: newUnit,
        stock_before: stockBefore, stock_after: newStock, diff: newStock - stockBefore,
        reason: "Koreksi dari Nilai Persediaan",
      });
    }
  }

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/stock-opname`);
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/kartu-stok`);
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null };
}
