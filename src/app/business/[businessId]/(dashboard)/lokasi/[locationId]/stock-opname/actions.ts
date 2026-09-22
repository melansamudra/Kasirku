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
  // BSJ yang punya kembaran otomatis di Bahan Baku (ingredient_id terisi)
  // stoknya yang BENERAN dipotong checkout/resep ada di kembarannya
  // (ingredient_location_stock), bukan di semi_finished_item_location_stock
  // (nyaris tidak pernah dipakai untuk item bermirror). Verifikasi opname
  // untuk BSJ jenis ini dialihkan ke kembarannya supaya koreksinya benar2
  // ngefek ke stok yang dipakai sistem, bukan diam-diam nulis ke tabel yang
  // gak pernah dibaca siapapun.
  let mirrorIngredientId: string | null = null;
  if (entry.component_type === "semi_finished" && entry.semi_finished_item_id) {
    const { data: semi } = await supabase
      .from("semi_finished_items")
      .select("ingredient_id")
      .eq("id", entry.semi_finished_item_id)
      .maybeSingle();
    mirrorIngredientId = semi?.ingredient_id ?? null;
  }
  const stockIngredientId = entry.component_type === "ingredient" ? entry.ingredient_id : mirrorIngredientId;

  let currentStock = 0;
  if (stockIngredientId) {
    const { data: row } = await supabase
      .from("ingredient_location_stock")
      .select("stock")
      .eq("business_id", businessId)
      .eq("location_id", entry.location_id)
      .eq("ingredient_id", stockIngredientId)
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
    if (stockIngredientId) {
      const { error } = await supabase.from("ingredient_location_stock").upsert(
        {
          business_id: businessId,
          location_id: entry.location_id,
          ingredient_id: stockIngredientId,
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

    // Kalau BSJ ini dialihkan ke kembarannya, riwayatnya ikut dicatat atas
    // nama ingredient_id (bukan semi_finished_item_id) -- biar konsisten
    // muncul di Kartu Stok bahan baku & riwayat harga/stok kembarannya,
    // sama seperti pergerakan checkout/produksi lain untuk bahan ini.
    const { error: adjError } = await supabase.from("stock_adjustments").insert({
      business_id: businessId,
      ingredient_id: stockIngredientId,
      semi_finished_item_id: entry.component_type === "semi_finished" && !stockIngredientId ? entry.semi_finished_item_id : null,
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
  counts: { itemId: string; itemType: "ingredient" | "semi_finished"; itemName: string; unit: string; reportedStock: number }[],
  entryDate: string,
): Promise<OpnameActionState> {
  if (counts.length === 0) return { error: "Belum ada bahan yang diisi." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return { error: "Tanggal opname tidak valid." };

  const supabase = await createClient();
  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const ingredientCounts = counts.filter((c) => c.itemType === "ingredient");
  const semiCounts = counts.filter((c) => c.itemType === "semi_finished");

  // BSJ yang punya kembaran otomatis di Bahan Baku dibaca dari
  // ingredient_location_stock milik kembarannya -- sama alasan panjang di
  // applyOpnameEntry/verifyAllPendingForDate di atas.
  const semiIds = semiCounts.map((c) => c.itemId);
  const mirrorIngredientBySemiId = new Map<string, string>();
  if (semiIds.length > 0) {
    const { data: semiMirrorRows } = await supabase
      .from("semi_finished_items")
      .select("id, ingredient_id")
      .in("id", semiIds);
    for (const row of semiMirrorRows ?? []) {
      if (row.ingredient_id) mirrorIngredientBySemiId.set(row.id, row.ingredient_id);
    }
  }

  const ingredientIds = [
    ...ingredientCounts.map((c) => c.itemId),
    ...[...mirrorIngredientBySemiId.values()],
  ];
  const { data: stockRows } = await supabase
    .from("ingredient_location_stock")
    .select("ingredient_id, stock")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .in("ingredient_id", ingredientIds.length > 0 ? ingredientIds : [""]);
  const stockByIngredient = new Map((stockRows ?? []).map((r) => [r.ingredient_id, Number(r.stock)]));

  const unmirrorredSemiIds = semiIds.filter((id) => !mirrorIngredientBySemiId.has(id));
  const { data: semiStockRows } =
    unmirrorredSemiIds.length > 0
      ? await supabase
          .from("semi_finished_item_location_stock")
          .select("semi_finished_item_id, stock")
          .eq("business_id", businessId)
          .eq("location_id", locationId)
          .in("semi_finished_item_id", unmirrorredSemiIds)
      : { data: [] as { semi_finished_item_id: string; stock: number }[] };
  const stockBySemiFinished = new Map((semiStockRows ?? []).map((r) => [r.semi_finished_item_id, Number(r.stock)]));

  const rows = [
    ...ingredientCounts.map((c) => ({
      business_id: businessId,
      location_id: locationId,
      component_type: "ingredient" as const,
      ingredient_id: c.itemId,
      semi_finished_item_id: null,
      item_name: c.itemName,
      unit: c.unit,
      reported_stock: c.reportedStock,
      system_stock_at_report: stockByIngredient.get(c.itemId) ?? 0,
      submitted_by_name: actor.name,
      entry_date: entryDate,
    })),
    ...semiCounts.map((c) => {
      const mirrorId = mirrorIngredientBySemiId.get(c.itemId);
      return {
        business_id: businessId,
        location_id: locationId,
        component_type: "semi_finished" as const,
        ingredient_id: null,
        semi_finished_item_id: c.itemId,
        item_name: c.itemName,
        unit: c.unit,
        reported_stock: c.reportedStock,
        system_stock_at_report: mirrorId
          ? (stockByIngredient.get(mirrorId) ?? 0)
          : (stockBySemiFinished.get(c.itemId) ?? 0),
        submitted_by_name: actor.name,
        entry_date: entryDate,
      };
    }),
  ];

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
// Dulu ini loop applyOpnameEntry() satu-per-satu (3 round-trip serial per
// entry: select stok, tulis stok, insert riwayat). Untuk puluhan bahan
// sekali verifikasi, itu bisa ratusan round-trip berurutan. Sekarang:
// 1 query ambil semua entry pending, 1-3 query paralel ambil stok terkini
// per tipe komponen, lalu tulis semuanya lewat batch upsert/insert.
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

  const pending = entries ?? [];
  if (pending.length === 0) {
    revalidatePath(`/business/${businessId}/lokasi/${locationId}/stock-opname`);
    revalidatePath(`/business/${businessId}/lokasi/${locationId}/kartu-stok`);
    return { error: null };
  }

  const ingredientIds = new Set<string>();
  const semiIds = new Set<string>();
  const warehouseIds = new Set<string>();
  for (const e of pending) {
    if (e.component_type === "ingredient" && e.ingredient_id) ingredientIds.add(e.ingredient_id);
    else if (e.component_type === "semi_finished" && e.semi_finished_item_id) semiIds.add(e.semi_finished_item_id);
    else if (e.warehouse_item_id) warehouseIds.add(e.warehouse_item_id);
  }

  // BSJ yang punya kembaran otomatis di Bahan Baku dialihkan ke kembarannya
  // (ingredient_location_stock) -- lihat catatan panjang di applyOpnameEntry
  // di atas kenapa semi_finished_item_location_stock nyaris selalu kosong
  // untuk item bermirror.
  const mirrorIngredientBySemiId = new Map<string, string>();
  if (semiIds.size > 0) {
    const { data: semiMirrorRows } = await supabase
      .from("semi_finished_items")
      .select("id, ingredient_id")
      .in("id", [...semiIds]);
    for (const row of semiMirrorRows ?? []) {
      if (row.ingredient_id) {
        mirrorIngredientBySemiId.set(row.id, row.ingredient_id);
        ingredientIds.add(row.ingredient_id);
        semiIds.delete(row.id);
      }
    }
  }

  const [{ data: ingredientRows }, { data: semiRows }, { data: warehouseRows }] = await Promise.all([
    ingredientIds.size > 0
      ? supabase
          .from("ingredient_location_stock")
          .select("ingredient_id, stock")
          .eq("business_id", businessId)
          .eq("location_id", locationId)
          .in("ingredient_id", [...ingredientIds])
      : Promise.resolve({ data: [] as { ingredient_id: string; stock: number }[] }),
    semiIds.size > 0
      ? supabase
          .from("semi_finished_item_location_stock")
          .select("semi_finished_item_id, stock")
          .eq("business_id", businessId)
          .eq("location_id", locationId)
          .in("semi_finished_item_id", [...semiIds])
      : Promise.resolve({ data: [] as { semi_finished_item_id: string; stock: number }[] }),
    warehouseIds.size > 0
      ? supabase
          .from("warehouse_items")
          .select("id, stock, name, unit")
          .eq("business_id", businessId)
          .in("id", [...warehouseIds])
      : Promise.resolve({ data: [] as { id: string; stock: number; name: string; unit: string }[] }),
  ]);

  const ingredientStock = new Map((ingredientRows ?? []).map((r) => [r.ingredient_id, Number(r.stock)]));
  const semiStock = new Map((semiRows ?? []).map((r) => [r.semi_finished_item_id, Number(r.stock)]));
  const warehouseInfo = new Map((warehouseRows ?? []).map((r) => [r.id, r]));

  type AdjustmentRow = {
    ingredient_id: string | null;
    semi_finished_item_id: string | null;
    warehouse_item_id: string | null;
    item_name: string;
    unit: string;
    stock_before: number;
    stock_after: number;
    diff: number;
    submitted_by_name: string;
  };
  const adjustments: AdjustmentRow[] = [];
  // Kalau kebetulan ada >1 entry pending utk item yang sama di tanggal yang
  // sama, koreksinya harus DIJUMLAHKAN berurutan (bukan saling menimpa) --
  // makanya "before" entry berikutnya diambil dari hasil kumulatif entry
  // sebelumnya, bukan dibaca ulang dari stok yang sama.
  const ingredientNext = new Map<string, number>();
  const semiNext = new Map<string, number>();
  const warehouseNext = new Map<string, number>();

  for (const e of pending) {
    const correction = Number(e.reported_stock) - Number(e.system_stock_at_report);
    if (correction === 0) continue;

    const mirrorIngredientId =
      e.component_type === "semi_finished" && e.semi_finished_item_id
        ? mirrorIngredientBySemiId.get(e.semi_finished_item_id)
        : undefined;

    if ((e.component_type === "ingredient" && e.ingredient_id) || mirrorIngredientId) {
      const ingId = mirrorIngredientId ?? (e.ingredient_id as string);
      const before = ingredientNext.get(ingId) ?? ingredientStock.get(ingId) ?? 0;
      const after = before + correction;
      ingredientNext.set(ingId, after);
      adjustments.push({
        ingredient_id: ingId,
        semi_finished_item_id: null,
        warehouse_item_id: null,
        item_name: e.item_name,
        unit: e.unit,
        stock_before: before,
        stock_after: after,
        diff: correction,
        submitted_by_name: e.submitted_by_name,
      });
    } else if (e.component_type === "semi_finished" && e.semi_finished_item_id) {
      const before = semiNext.get(e.semi_finished_item_id) ?? semiStock.get(e.semi_finished_item_id) ?? 0;
      const after = before + correction;
      semiNext.set(e.semi_finished_item_id, after);
      adjustments.push({
        ingredient_id: null,
        semi_finished_item_id: e.semi_finished_item_id,
        warehouse_item_id: null,
        item_name: e.item_name,
        unit: e.unit,
        stock_before: before,
        stock_after: after,
        diff: correction,
        submitted_by_name: e.submitted_by_name,
      });
    } else if (e.warehouse_item_id) {
      const before = warehouseNext.get(e.warehouse_item_id) ?? warehouseInfo.get(e.warehouse_item_id)?.stock ?? 0;
      const after = before + correction;
      warehouseNext.set(e.warehouse_item_id, after);
      adjustments.push({
        ingredient_id: null,
        semi_finished_item_id: null,
        warehouse_item_id: e.warehouse_item_id,
        item_name: e.item_name,
        unit: e.unit,
        stock_before: before,
        stock_after: after,
        diff: correction,
        submitted_by_name: e.submitted_by_name,
      });
    }
  }

  const nowIso = new Date().toISOString();

  const ingredientWrite =
    ingredientNext.size > 0
      ? supabase.from("ingredient_location_stock").upsert(
          [...ingredientNext.entries()].map(([ingredient_id, stock]) => ({
            business_id: businessId,
            location_id: locationId,
            ingredient_id,
            stock,
            updated_at: nowIso,
          })),
          { onConflict: "location_id,ingredient_id" },
        )
      : null;
  const semiWrite =
    semiNext.size > 0
      ? supabase.from("semi_finished_item_location_stock").upsert(
          [...semiNext.entries()].map(([semi_finished_item_id, stock]) => ({
            business_id: businessId,
            location_id: locationId,
            semi_finished_item_id,
            stock,
            updated_at: nowIso,
          })),
          { onConflict: "location_id,semi_finished_item_id" },
        )
      : null;
  const warehouseWrite =
    warehouseNext.size > 0
      ? supabase.from("warehouse_items").upsert(
          [...warehouseNext.entries()].map(([id, stock]) => {
            const info = warehouseInfo.get(id);
            return {
              id,
              business_id: businessId,
              location_id: locationId,
              name: info?.name ?? "",
              unit: info?.unit ?? "",
              stock,
              updated_at: nowIso,
            };
          }),
          { onConflict: "id" },
        )
      : null;
  const adjustmentWrite =
    adjustments.length > 0
      ? supabase.from("stock_adjustments").insert(
          adjustments.map((a) => ({
            business_id: businessId,
            location_id: locationId,
            reason: "Stok opname",
            ...a,
          })),
        )
      : null;

  const noError = { error: null as { message: string } | null };
  const [ingredientRes, semiRes, warehouseRes, adjRes] = await Promise.all([
    ingredientWrite ?? Promise.resolve(noError),
    semiWrite ?? Promise.resolve(noError),
    warehouseWrite ?? Promise.resolve(noError),
    adjustmentWrite ?? Promise.resolve(noError),
  ]);
  const failed = [ingredientRes, semiRes, warehouseRes, adjRes].find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  const { error: statusError } = await supabase
    .from("stock_opname_entries")
    .update({ status: "verified", verified_at: nowIso })
    .in("id", pending.map((e) => e.id));
  if (statusError) return { error: statusError.message };

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
  newName: string,
): Promise<OpnameActionState> {
  if (Number.isNaN(newStock) || newStock < 0) {
    return { error: "Stok harus angka dan tidak boleh negatif." };
  }
  newUnit = newUnit.trim();
  if (!newUnit) return { error: "Satuan wajib diisi." };
  newName = newName.trim();
  if (!newName) return { error: "Nama wajib diisi." };

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

    if (newUnit !== ingredient.unit || newName !== ingredient.name) {
      const { error: updateError } = await supabase
        .from("ingredients")
        .update({ unit: newUnit, name: newName })
        .eq("id", itemId);
      if (updateError) return { error: updateError.message };
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
        item_name: newName, unit: newUnit,
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
    const changed = newUnit !== item.unit || newName !== item.name || Math.abs(newStock - stockBefore) > 1e-9;
    if (changed) {
      const { error: updateError } = await supabase
        .from("warehouse_items")
        .update({ name: newName, unit: newUnit, stock: newStock, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (updateError) {
        return {
          error: updateError.code === "23505" ? `Barang "${newName}" sudah ada di lokasi ini.` : updateError.message,
        };
      }
    }
    if (Math.abs(newStock - stockBefore) > 1e-9) {
      await supabase.from("stock_adjustments").insert({
        business_id: businessId, warehouse_item_id: itemId, location_id: locationId,
        item_name: newName, unit: newUnit,
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
