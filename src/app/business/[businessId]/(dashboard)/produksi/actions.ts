"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { computeSemiFinishedItemCost } from "@/lib/cost-control/compute-cost";
import type { Database } from "@/lib/types/database";

export type ActionState = { error: string | null };

// Mutasi stok (potong komponen + tambah stok hasil) yang sebelumnya cuma ada
// di recordProductionRun, ditarik jadi fungsi bersama supaya bisa dipakai
// juga oleh verifyProductionRun (draft hasil scan publik yang baru boleh
// menyentuh stok setelah diverifikasi). Mengembalikan total_cost/unit_cost
// hasil hitung, atau { error } kalau stok komponen tidak cukup.
async function applyProductionStockMutation(
  supabase: SupabaseClient<Database>,
  businessId: string,
  runId: string,
  semiFinishedItemId: string,
  itemStock: number,
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
      ? ((await supabase.from("ingredients").select("id, stock").in("id", ingredientIds)).data ?? [])
      : [];
  const semiStocks =
    semiIds.length > 0
      ? ((await supabase.from("semi_finished_items").select("id, stock").in("id", semiIds)).data ?? [])
      : [];

  const stockMap = new Map<string, number>();
  for (const row of ingredientStocks) stockMap.set(row.id, Number(row.stock));
  for (const row of semiStocks) stockMap.set(row.id, Number(row.stock));

  const shortages: string[] = [];
  for (const line of cost.breakdown) {
    const need = line.qty * qtyProduced;
    const available = stockMap.get(line.id) ?? 0;
    if (available < need - 1e-9) {
      shortages.push(`${line.name} (butuh ${need.toFixed(2)} ${line.unit}, tersedia ${available.toFixed(2)})`);
    }
  }
  if (shortages.length > 0) {
    return { error: `Stok tidak cukup: ${shortages.join(", ")}.` };
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

    const table = line.componentType === "ingredient" ? "ingredients" : "semi_finished_items";
    await supabase
      .from(table)
      .update({ stock: (stockMap.get(line.id) ?? 0) - need })
      .eq("id", line.id)
      .eq("business_id", businessId);
  }

  await supabase
    .from("semi_finished_items")
    .update({ stock: itemStock + qtyProduced })
    .eq("id", semiFinishedItemId)
    .eq("business_id", businessId);

  return { totalCost, unitCost: cost.unitCost };
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

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("id, name, unit, stock")
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
    run.id,
    semiFinishedItemId,
    Number(item.stock),
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
    const table = c.component_type === "ingredient" ? "ingredients" : "semi_finished_items";
    const componentId = c.component_type === "ingredient" ? c.ingredient_id : c.semi_finished_item_id;
    if (!componentId) continue;

    const { data: current } = await supabase.from(table).select("stock").eq("id", componentId).maybeSingle();
    if (current) {
      await supabase
        .from(table)
        .update({ stock: Number(current.stock) + Number(c.qty_consumed) })
        .eq("id", componentId);
    }
  }

  if (run.semi_finished_item_id) {
    const { data: item } = await supabase
      .from("semi_finished_items")
      .select("stock")
      .eq("id", run.semi_finished_item_id)
      .maybeSingle();
    if (item) {
      await supabase
        .from("semi_finished_items")
        .update({ stock: Math.max(0, Number(item.stock) - Number(run.qty_produced)) })
        .eq("id", run.semi_finished_item_id);
    }
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
export async function verifyProductionRun(businessId: string, runId: string): Promise<ActionState> {
  const supabase = await createClient();

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
    .select("stock")
    .eq("id", run.semi_finished_item_id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!item) {
    return { error: "Item bahan setengah jadi sudah dihapus." };
  }

  const mutation = await applyProductionStockMutation(
    supabase,
    businessId,
    run.id,
    run.semi_finished_item_id,
    Number(item.stock),
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
