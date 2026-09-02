"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { computeSemiFinishedItemCost } from "@/lib/cost-control/compute-cost";
import type { Database } from "@/lib/types/database";

export type ActionState = { error: string | null };

// Saklar darurat per bisnis buat tunda pemotongan stok produksi (mis. Llauk
// Nusantara yang masih uji coba, belum siap datanya dipotong) tanpa perlu
// sembunyikan/hapus data produksi yang sudah ada -- default true supaya
// bisnis lain yang sudah jalan tidak terdampak sama sekali.
async function isStockDeductionEnabled(
  supabase: SupabaseClient<Database>,
  businessId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("businesses")
    .select("stock_deduction_enabled")
    .eq("id", businessId)
    .single();
  return data?.stock_deduction_enabled ?? true;
}

// Produksi cuma terjadi & memotong stok di satu lokasi fisik (Dapur
// Produksi, ditandai stock_locations.is_production) -- lihat plan Fase 2
// "Satukan Stok per Lokasi". null kalau lokasi itu belum diset (mis. migrasi
// belum jalan) — dipakai caller untuk gagal eksplisit sebelum menyentuh stok.
async function getProductionLocationId(
  supabase: SupabaseClient<Database>,
  businessId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("business_id", businessId)
    .eq("is_production", true)
    .maybeSingle();
  return data?.id ?? null;
}

// Mutasi stok (potong komponen + tambah stok hasil) yang sebelumnya cuma ada
// di recordProductionRun, ditarik jadi fungsi bersama supaya bisa dipakai
// juga oleh verifyProductionRun (draft hasil scan publik yang baru boleh
// menyentuh stok setelah diverifikasi). Baca/tulis stok di
// ingredient_location_stock/semi_finished_item_location_stock milik lokasi
// Dapur Produksi (BUKAN ingredients.stock/semi_finished_items.stock, yang
// berhenti dipakai di jalur cost-control). Mengembalikan total_cost/unit_cost
// hasil hitung, atau { error } kalau stok komponen tidak cukup.
async function applyProductionStockMutation(
  supabase: SupabaseClient<Database>,
  businessId: string,
  locationId: string,
  runId: string,
  semiFinishedItemId: string,
  qtyProduced: number,
): Promise<{ error: string } | { totalCost: number; unitCost: number }> {
  const cost = await computeSemiFinishedItemCost(supabase, businessId, semiFinishedItemId);
  if (cost.breakdown.length === 0) {
    return { error: "Bahan ini belum punya resep — atur dulu resepnya di halaman Bahan Setengah Jadi." };
  }

  const ingredientIds = cost.breakdown.filter((l) => l.componentType === "ingredient").map((l) => l.id);
  const semiIds = cost.breakdown.filter((l) => l.componentType === "semi_finished").map((l) => l.id);

  const ingredientStocks =
    ingredientIds.length > 0
      ? (
          await supabase
            .from("ingredient_location_stock")
            .select("id, ingredient_id, stock")
            .eq("location_id", locationId)
            .in("ingredient_id", ingredientIds)
        ).data ?? []
      : [];
  const semiStocks =
    semiIds.length > 0
      ? (
          await supabase
            .from("semi_finished_item_location_stock")
            .select("id, semi_finished_item_id, stock")
            .eq("location_id", locationId)
            .in("semi_finished_item_id", semiIds)
        ).data ?? []
      : [];

  const rowMap = new Map<string, { id: string; stock: number }>();
  for (const row of ingredientStocks) rowMap.set(row.ingredient_id, { id: row.id, stock: Number(row.stock) });
  for (const row of semiStocks) rowMap.set(row.semi_finished_item_id, { id: row.id, stock: Number(row.stock) });

  const shortages: string[] = [];
  for (const line of cost.breakdown) {
    const need = line.qty * qtyProduced;
    const available = rowMap.get(line.id)?.stock ?? 0;
    if (available < need - 1e-9) {
      shortages.push(`${line.name} (butuh ${need.toFixed(2)} ${line.unit}, tersedia ${available.toFixed(2)})`);
    }
  }
  if (shortages.length > 0) {
    return { error: `Stok tidak cukup di Dapur Produksi: ${shortages.join(", ")}.` };
  }

  const totalCost = cost.unitCost * qtyProduced;

  for (const line of cost.breakdown) {
    const need = line.qty * qtyProduced;
    await supabase.from("production_run_consumptions").insert({
      business_id: businessId,
      production_run_id: runId,
      component_type: line.componentType,
      ingredient_id: line.componentType === "ingredient" ? line.id : null,
      semi_finished_item_id: line.componentType === "semi_finished" ? line.id : null,
      component_name: line.name,
      qty_consumed: need,
      unit: line.unit,
      unit_cost_at_time: line.unitCost,
      subtotal_cost: line.subtotal * qtyProduced,
    });

    const table = line.componentType === "ingredient" ? "ingredient_location_stock" : "semi_finished_item_location_stock";
    const row = rowMap.get(line.id)!;
    await supabase.from(table).update({ stock: row.stock - need }).eq("id", row.id);
  }

  await upsertSemiFinishedLocationStock(supabase, businessId, locationId, semiFinishedItemId, qtyProduced);

  return { totalCost, unitCost: cost.unitCost };
}

// Tambah `delta` ke stok lokasi suatu bahan setengah jadi (insert baris baru
// kalau belum ada) — dipakai untuk mengkredit hasil produksi ke
// semi_finished_item_location_stock milik Dapur Produksi. `delta` boleh
// negatif (dipakai voidProductionRun untuk membalik, di-floor ke 0).
async function upsertSemiFinishedLocationStock(
  supabase: SupabaseClient<Database>,
  businessId: string,
  locationId: string,
  semiFinishedItemId: string,
  delta: number,
): Promise<void> {
  const { data: existing } = await supabase
    .from("semi_finished_item_location_stock")
    .select("id, stock")
    .eq("location_id", locationId)
    .eq("semi_finished_item_id", semiFinishedItemId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("semi_finished_item_location_stock")
      .update({ stock: Math.max(0, Number(existing.stock) + delta) })
      .eq("id", existing.id);
  } else {
    await supabase.from("semi_finished_item_location_stock").insert({
      business_id: businessId,
      location_id: locationId,
      semi_finished_item_id: semiFinishedItemId,
      stock: Math.max(0, delta),
    });
  }
}

// Sama seperti di atas, tapi untuk ingredient_location_stock — dipakai
// voidProductionRun mengembalikan bahan baku yang sempat dikonsumsi.
async function upsertIngredientLocationStock(
  supabase: SupabaseClient<Database>,
  businessId: string,
  locationId: string,
  ingredientId: string,
  delta: number,
): Promise<void> {
  const { data: existing } = await supabase
    .from("ingredient_location_stock")
    .select("id, stock")
    .eq("location_id", locationId)
    .eq("ingredient_id", ingredientId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("ingredient_location_stock")
      .update({ stock: Math.max(0, Number(existing.stock) + delta) })
      .eq("id", existing.id);
  } else {
    await supabase.from("ingredient_location_stock").insert({
      business_id: businessId,
      location_id: locationId,
      ingredient_id: ingredientId,
      stock: Math.max(0, delta),
    });
  }
}

// Jalur ALTERNATIF dari applyProductionStockMutation -- dipakai kalau
// supervisor pilih "Verifikasi pakai Yang Dilaporkan": bahan yang benar-benar
// dipotong stoknya adalah qty yang DILAPORKAN staf lewat scan (sudah harus
// semuanya tercocok ke ingredient_id), bukan hasil kali resep standar x qty.
// qty di production_run_reported_consumptions adalah TOTAL untuk satu batch
// (bukan per-1-unit-hasil seperti semi_finished_recipes), jadi tidak dikali
// qtyProduced lagi di sini.
async function applyReportedStockMutation(
  supabase: SupabaseClient<Database>,
  businessId: string,
  locationId: string,
  runId: string,
  semiFinishedItemId: string,
  qtyProduced: number,
): Promise<{ error: string } | { totalCost: number; unitCost: number }> {
  const { data: reportedLines } = await supabase
    .from("production_run_reported_consumptions")
    .select("id, ingredient_id, reported_name, reported_unit, qty")
    .eq("production_run_id", runId);

  if (!reportedLines || reportedLines.length === 0) {
    return { error: "Tidak ada bahan yang dilaporkan untuk batch ini." };
  }
  if (reportedLines.some((l) => !l.ingredient_id)) {
    return { error: "Masih ada bahan yang dilaporkan belum dicocokkan ke bahan baku." };
  }

  const ingredientIds = reportedLines.map((l) => l.ingredient_id as string);
  const [{ data: ingRows }, { data: locStockRows }] = await Promise.all([
    supabase.from("ingredients").select("id, name, unit_cost").in("id", ingredientIds),
    supabase
      .from("ingredient_location_stock")
      .select("id, ingredient_id, stock")
      .eq("location_id", locationId)
      .in("ingredient_id", ingredientIds),
  ]);
  const ingById = new Map((ingRows ?? []).map((r) => [r.id, r]));
  const locStockById = new Map((locStockRows ?? []).map((r) => [r.ingredient_id, { id: r.id, stock: Number(r.stock) }]));

  const shortages: string[] = [];
  for (const line of reportedLines) {
    const ing = ingById.get(line.ingredient_id as string);
    if (!ing) {
      shortages.push(`${line.reported_name} (bahan sudah dihapus)`);
      continue;
    }
    const available = locStockById.get(line.ingredient_id as string)?.stock ?? 0;
    if (available < Number(line.qty) - 1e-9) {
      shortages.push(`${ing.name} (butuh ${line.qty} ${line.reported_unit}, tersedia ${available})`);
    }
  }
  if (shortages.length > 0) {
    return { error: `Stok tidak cukup di Dapur Produksi: ${shortages.join(", ")}.` };
  }

  let totalCost = 0;
  for (const line of reportedLines) {
    const ing = ingById.get(line.ingredient_id as string)!;
    const subtotal = Number(ing.unit_cost) * Number(line.qty);
    totalCost += subtotal;

    await supabase.from("production_run_consumptions").insert({
      business_id: businessId,
      production_run_id: runId,
      component_type: "ingredient",
      ingredient_id: ing.id,
      semi_finished_item_id: null,
      component_name: ing.name,
      qty_consumed: line.qty,
      unit: line.reported_unit,
      unit_cost_at_time: ing.unit_cost,
      subtotal_cost: subtotal,
    });

    const locRow = locStockById.get(line.ingredient_id as string)!;
    await supabase
      .from("ingredient_location_stock")
      .update({ stock: locRow.stock - Number(line.qty) })
      .eq("id", locRow.id);
  }

  await upsertSemiFinishedLocationStock(supabase, businessId, locationId, semiFinishedItemId, qtyProduced);

  return { totalCost, unitCost: qtyProduced > 0 ? totalCost / qtyProduced : 0 };
}

// Sequential-await, bukan RPC transaksional — sama pola dengan addPurchase
// (purchases/actions.ts): cek dulu SEMUA komponen cukup (all-or-nothing)
// sebelum menyentuh stok apa pun, baru lakukan mutasi.
export async function recordProductionRun(
  businessId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const semiFinishedItemId = formData.get("semiFinishedItemId") as string;
  const qtyProduced = Number(formData.get("qtyProduced") as string);
  const employeeId = (formData.get("employeeId") as string) || null;
  const note = (formData.get("note") as string)?.trim();

  if (!semiFinishedItemId) {
    return { error: "Pilih bahan setengah jadi yang diproduksi." };
  }
  if (!(qtyProduced > 0)) {
    return { error: "Jumlah produksi harus lebih dari 0." };
  }

  const supabase = await createClient();

  if (!(await isStockDeductionEnabled(supabase, businessId))) {
    return { error: "Pemotongan stok sedang dinonaktifkan untuk bisnis ini." };
  }

  const locationId = await getProductionLocationId(supabase, businessId);
  if (!locationId) {
    return { error: "Lokasi produksi (Dapur Produksi) belum diatur. Hubungi admin untuk migrasi data lokasi." };
  }

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("id, name, unit")
    .eq("id", semiFinishedItemId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!item) {
    return { error: "Bahan setengah jadi tidak ditemukan." };
  }

  let employeeName = "Tim Produksi";
  if (employeeId) {
    const { data: employee } = await supabase
      .from("employees")
      .select("id, name")
      .eq("id", employeeId)
      .eq("business_id", businessId)
      .eq("active", true)
      .maybeSingle();
    if (!employee) {
      return { error: "Karyawan tidak ditemukan." };
    }
    employeeName = employee.name;
  }

  // Insert dulu sebagai 'verified' (belum ada bahan yg dikonsumsi tercatat),
  // baru jalankan mutasi stok — kalau mutasi gagal (stok kurang), hapus lagi
  // baris production_runs-nya supaya tidak nyangkut sebagai draft aneh.
  const { data: run, error: runError } = await supabase
    .from("production_runs")
    .insert({
      business_id: businessId,
      semi_finished_item_id: semiFinishedItemId,
      item_name: item.name,
      qty_produced: qtyProduced,
      unit: item.unit,
      produced_by_employee_id: employeeId,
      produced_by_name: employeeName,
      note: note || null,
      status: "verified",
    })
    .select("id")
    .single();

  if (runError || !run) {
    return { error: runError?.message ?? "Gagal mencatat produksi." };
  }

  const mutation = await applyProductionStockMutation(
    supabase,
    businessId,
    locationId,
    run.id,
    semiFinishedItemId,
    qtyProduced,
  );
  if ("error" in mutation) {
    await supabase.from("production_runs").delete().eq("id", run.id);
    return { error: `${mutation.error} Ajukan Permintaan Barang dulu.` };
  }
  const { totalCost } = mutation;

  await supabase
    .from("production_runs")
    .update({ total_cost: mutation.totalCost, unit_cost: mutation.unitCost })
    .eq("id", run.id);

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Produksi ${item.name}: ${qtyProduced} ${item.unit}`,
    `Oleh ${employeeName}, biaya ${Math.round(totalCost).toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/produksi`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/semi-finished-items/${semiFinishedItemId}`);
  return { error: null };
}

export async function voidProductionRun(businessId: string, runId: string, reason: string): Promise<ActionState> {
  if (!reason?.trim()) {
    return { error: "Alasan pembatalan wajib diisi." };
  }

  const supabase = await createClient();

  const locationId = await getProductionLocationId(supabase, businessId);
  if (!locationId) {
    return { error: "Lokasi produksi (Dapur Produksi) belum diatur. Hubungi admin untuk migrasi data lokasi." };
  }

  const { data: run } = await supabase
    .from("production_runs")
    .select("id, semi_finished_item_id, qty_produced, voided")
    .eq("id", runId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!run) {
    return { error: "Produksi tidak ditemukan." };
  }
  if (run.voided) {
    return { error: "Produksi ini sudah dibatalkan sebelumnya." };
  }

  const { data: consumptions } = await supabase
    .from("production_run_consumptions")
    .select("component_type, ingredient_id, semi_finished_item_id, qty_consumed")
    .eq("production_run_id", runId);

  for (const c of consumptions ?? []) {
    const componentId = c.component_type === "ingredient" ? c.ingredient_id : c.semi_finished_item_id;
    if (!componentId) continue;

    if (c.component_type === "ingredient") {
      await upsertIngredientLocationStock(supabase, businessId, locationId, componentId, Number(c.qty_consumed));
    } else {
      await upsertSemiFinishedLocationStock(supabase, businessId, locationId, componentId, Number(c.qty_consumed));
    }
  }

  if (run.semi_finished_item_id) {
    await upsertSemiFinishedLocationStock(
      supabase,
      businessId,
      locationId,
      run.semi_finished_item_id,
      -Number(run.qty_produced),
    );
  }

  await supabase
    .from("production_runs")
    .update({ voided: true, voided_at: new Date().toISOString(), void_reason: reason.trim() })
    .eq("id", runId)
    .eq("business_id", businessId);

  await logActivity(supabase, businessId, "produk", "warning", "Produksi dibatalkan", reason.trim());

  revalidatePath(`/business/${businessId}/produksi`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  return { error: null };
}

// Draft hasil scan barcode publik (status 'pending') baru menyentuh stok di
// sini — supervisor mengecek angkanya dulu lewat dashboard baru verifikasi.
export async function verifyProductionRun(
  businessId: string,
  runId: string,
  useReported: boolean = false,
): Promise<ActionState> {
  const supabase = await createClient();

  if (!(await isStockDeductionEnabled(supabase, businessId))) {
    return { error: "Pemotongan stok sedang dinonaktifkan untuk bisnis ini." };
  }

  const locationId = await getProductionLocationId(supabase, businessId);
  if (!locationId) {
    return { error: "Lokasi produksi (Dapur Produksi) belum diatur. Hubungi admin untuk migrasi data lokasi." };
  }

  const { data: run } = await supabase
    .from("production_runs")
    .select("id, semi_finished_item_id, qty_produced, status")
    .eq("id", runId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!run) {
    return { error: "Produksi tidak ditemukan." };
  }
  if (run.status !== "pending") {
    return { error: "Produksi ini sudah diproses sebelumnya." };
  }
  if (!run.semi_finished_item_id) {
    return { error: "Item bahan setengah jadi sudah dihapus." };
  }

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("id")
    .eq("id", run.semi_finished_item_id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!item) {
    return { error: "Item bahan setengah jadi sudah dihapus." };
  }

  const mutation = useReported
    ? await applyReportedStockMutation(
        supabase,
        businessId,
        locationId,
        run.id,
        run.semi_finished_item_id,
        Number(run.qty_produced),
      )
    : await applyProductionStockMutation(
        supabase,
        businessId,
        locationId,
        run.id,
        run.semi_finished_item_id,
        Number(run.qty_produced),
      );
  if ("error" in mutation) {
    return { error: mutation.error };
  }

  await supabase
    .from("production_runs")
    .update({ status: "verified", total_cost: mutation.totalCost, unit_cost: mutation.unitCost })
    .eq("id", runId);

  await logActivity(supabase, businessId, "produk", "sukses", "Produksi hasil scan diverifikasi");

  revalidatePath(`/business/${businessId}/produksi`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  return { error: null };
}

export async function rejectProductionRun(businessId: string, runId: string, reason: string): Promise<ActionState> {
  if (!reason?.trim()) {
    return { error: "Alasan penolakan wajib diisi." };
  }

  const supabase = await createClient();

  const { data: run } = await supabase
    .from("production_runs")
    .select("id, status")
    .eq("id", runId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!run) {
    return { error: "Produksi tidak ditemukan." };
  }
  if (run.status !== "pending") {
    return { error: "Produksi ini sudah diproses sebelumnya." };
  }

  await supabase
    .from("production_runs")
    .update({ status: "rejected", reject_reason: reason.trim() })
    .eq("id", runId)
    .eq("business_id", businessId);

  await logActivity(supabase, businessId, "produk", "warning", "Produksi hasil scan ditolak", reason.trim());

  revalidatePath(`/business/${businessId}/produksi`);
  return { error: null };
}

export type RegenerateSlugState = { error: string | null; slug: string | null };

export async function regenerateProductionScanSlug(businessId: string): Promise<RegenerateSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase
    .from("businesses")
    .update({ production_scan_slug: slug })
    .eq("id", businessId);

  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link scan produksi diganti");
  revalidatePath(`/business/${businessId}/produksi`);
  return { error: null, slug };
}

// Draft hasil scan yang namanya belum cocok katalog mana pun
// (semi_finished_item_id null) -- supervisor arahkan ke item LAMA yang sudah
// ada. Nama & satuan draft ikut disamakan ke item lama itu (bukan sebaliknya)
// supaya katalog tidak ikut berubah gara-gara typo/istilah beda dari staf.
export async function linkPendingProductionToExistingItem(
  businessId: string,
  runId: string,
  existingItemId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("production_runs")
    .select("id, status, semi_finished_item_id")
    .eq("id", runId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!run) return { error: "Produksi tidak ditemukan." };
  if (run.status !== "pending") return { error: "Produksi ini sudah diproses sebelumnya." };
  if (run.semi_finished_item_id) return { error: "Draft ini sudah terhubung ke sebuah item." };

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("id, name, unit")
    .eq("id", existingItemId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!item) return { error: "Item tidak ditemukan." };

  await supabase
    .from("production_runs")
    .update({ semi_finished_item_id: item.id, item_name: item.name, unit: item.unit })
    .eq("id", runId)
    .eq("business_id", businessId);

  revalidatePath(`/business/${businessId}/produksi`);
  return { error: null };
}

// Draft hasil scan yang belum ada di katalog -- supervisor putuskan bikin
// item BARU (resep masih kosong, diisi manual belakangan di halaman Bahan
// Setengah Jadi -- verifikasi produksi ini sendiri baru bisa jalan setelah
// resepnya ada, sama seperti item lama yang belum ada resep).
export async function createItemForPendingProduction(businessId: string, runId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("production_runs")
    .select("id, status, semi_finished_item_id, item_name, unit")
    .eq("id", runId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!run) return { error: "Produksi tidak ditemukan." };
  if (run.status !== "pending") return { error: "Produksi ini sudah diproses sebelumnya." };
  if (run.semi_finished_item_id) return { error: "Draft ini sudah terhubung ke sebuah item." };

  const { data: newItem, error: insertError } = await supabase
    .from("semi_finished_items")
    .insert({ business_id: businessId, name: run.item_name, unit: run.unit })
    .select("id")
    .single();
  if (insertError || !newItem) {
    return { error: insertError?.message ?? "Gagal membuat item baru." };
  }

  await supabase
    .from("production_runs")
    .update({ semi_finished_item_id: newItem.id })
    .eq("id", runId)
    .eq("business_id", businessId);

  await logActivity(supabase, businessId, "produk", "sukses", `Bahan setengah jadi baru dari scan: ${run.item_name}`);
  revalidatePath(`/business/${businessId}/produksi`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  return { error: null };
}

// Baris "bahan yang benar-benar dipakai" hasil laporan staf (ingredient_id
// masih null karena diketik manual) -- supervisor cocokkan ke bahan baku
// LAMA yang sudah ada. Nama/satuan disamakan ke bahan baku itu (bukan
// sebaliknya), sama prinsipnya dengan linkPendingProductionToExistingItem.
export async function linkReportedIngredientToExisting(
  businessId: string,
  reportedRowId: string,
  existingIngredientId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("production_run_reported_consumptions")
    .select("id, ingredient_id")
    .eq("id", reportedRowId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!row) return { error: "Baris bahan tidak ditemukan." };
  if (row.ingredient_id) return { error: "Baris ini sudah dicocokkan." };

  const { data: ingredient } = await supabase
    .from("ingredients")
    .select("id, name, unit")
    .eq("id", existingIngredientId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ingredient) return { error: "Bahan baku tidak ditemukan." };

  await supabase
    .from("production_run_reported_consumptions")
    .update({ ingredient_id: ingredient.id, reported_name: ingredient.name, reported_unit: ingredient.unit })
    .eq("id", reportedRowId)
    .eq("business_id", businessId);

  revalidatePath(`/business/${businessId}/produksi`);
  return { error: null };
}

// Bahan yang dilaporkan memang belum ada di master -- buat bahan baku BARU
// (harga masih Rp0, diisi manual belakangan di halaman Bahan Baku).
export async function createIngredientForReportedConsumption(
  businessId: string,
  reportedRowId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("production_run_reported_consumptions")
    .select("id, ingredient_id, reported_name, reported_unit")
    .eq("id", reportedRowId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!row) return { error: "Baris bahan tidak ditemukan." };
  if (row.ingredient_id) return { error: "Baris ini sudah dicocokkan." };

  const { data: newIngredient, error: insertError } = await supabase
    .from("ingredients")
    .insert({ business_id: businessId, name: row.reported_name, unit: row.reported_unit, unit_cost: 0 })
    .select("id")
    .single();
  if (insertError || !newIngredient) {
    return { error: insertError?.message ?? "Gagal membuat bahan baku baru." };
  }

  await supabase
    .from("production_run_reported_consumptions")
    .update({ ingredient_id: newIngredient.id })
    .eq("id", reportedRowId)
    .eq("business_id", businessId);

  await logActivity(supabase, businessId, "produk", "sukses", `Bahan baku baru dari laporan produksi: ${row.reported_name}`);
  revalidatePath(`/business/${businessId}/produksi`);
  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}
