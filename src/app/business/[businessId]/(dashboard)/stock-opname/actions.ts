"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type SubmitOpnameState = { error: string | null; resetToken: number };

// Submit = cuma catat "pending", TIDAK mengubah ingredients.stock sama
// sekali -- owner/staf boleh cek dulu sebelum ada yang diterapkan (lihat
// verifyOpnameEntry untuk titik satu-satunya yang benar-benar mengubah stok).
export async function submitOpnameEntries(
  businessId: string,
  prevState: SubmitOpnameState,
  formData: FormData,
): Promise<SubmitOpnameState> {
  const fail = (msg: string): SubmitOpnameState => ({ error: msg, resetToken: prevState.resetToken });

  const entryDate = formData.get("entryDate") as string;
  const submittedByName = (formData.get("submittedByName") as string)?.trim() || null;
  if (!entryDate) return fail("Tanggal wajib diisi.");

  const supabase = await createClient();

  // Field bernama reported_<ingredientId> dikirim dari form -- cuma yang
  // benar-benar diisi (bukan string kosong) yang diproses.
  const rows: { ingredient_id: string; reported: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("reported_")) continue;
    const raw = (value as string)?.trim();
    if (!raw) continue;
    const num = Number(raw);
    if (Number.isNaN(num) || num < 0) continue;
    rows.push({ ingredient_id: key.replace("reported_", ""), reported: num });
  }

  if (rows.length === 0) {
    return fail("Isi minimal satu bahan dengan stok fisik yang dihitung.");
  }

  const { data: ingredients, error: ingErr } = await supabase
    .from("ingredients")
    .select("id, stock")
    .eq("business_id", businessId)
    .in("id", rows.map((r) => r.ingredient_id));

  if (ingErr) return fail(ingErr.message);
  const stockById = new Map((ingredients ?? []).map((i) => [i.id, Number(i.stock)]));

  const insertRows = rows
    .filter((r) => stockById.has(r.ingredient_id))
    .map((r) => ({
      business_id: businessId,
      ingredient_id: r.ingredient_id,
      entry_date: entryDate,
      reported_stock: r.reported,
      system_stock_at_report: stockById.get(r.ingredient_id)!,
      submitted_by_name: submittedByName,
    }));

  const { error: insertError } = await supabase.from("ingredient_opname_entries").insert(insertRows);
  if (insertError) return fail(insertError.message);

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    `Stock Opname dicatat (${insertRows.length} bahan)`,
    `Tanggal ${entryDate}${submittedByName ? ` oleh ${submittedByName}` : ""}`,
  );

  revalidatePath(`/business/${businessId}/stock-opname`);
  return { error: null, resetToken: prevState.resetToken + 1 };
}

// Satu-satunya titik yang benar-benar mengubah ingredients.stock -- pakai
// KOREKSI (reported - system_stock_at_report) ditambahkan ke stok TERKINI,
// bukan menimpa mentah, supaya aman kalau ada penjualan/pembelian lain yang
// terjadi di antara submit dan verifikasi.
// `applyToStock` datang dari cekbox di halaman -- default TIDAK dicentang.
// Verifikasi tanpa cekbox cuma menandai entri "sudah ditinjau" (status
// verified) tanpa menyentuh ingredients.stock sama sekali; instrumen yang
// benar-benar mengoreksi stok adalah kombinasi verify + cekbox dicentang.
export async function verifyOpnameEntry(
  businessId: string,
  entryId: string,
  applyToStock: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: entry, error: entryErr } = await supabase
    .from("ingredient_opname_entries")
    .select("id, ingredient_id, reported_stock, system_stock_at_report, entry_date, status, submitted_by_name")
    .eq("id", entryId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (entryErr) return { error: entryErr.message };
  if (!entry) return { error: "Entri opname tidak ditemukan." };
  if (entry.status !== "pending") return { error: "Entri ini sudah diproses." };

  if (!applyToStock) {
    const { error: statusError } = await supabase
      .from("ingredient_opname_entries")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .eq("id", entryId);
    if (statusError) return { error: statusError.message };

    await logActivity(
      supabase,
      businessId,
      "sistem",
      "info",
      "Stock Opname ditinjau (stok tidak diubah)",
      `Entri ${entryId} ditandai selesai tanpa koreksi stok.`,
    );
    revalidatePath(`/business/${businessId}/stock-opname`);
    return { error: null };
  }

  const { data: ingredient, error: ingErr } = await supabase
    .from("ingredients")
    .select("id, name, unit, stock")
    .eq("id", entry.ingredient_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (ingErr) return { error: ingErr.message };
  if (!ingredient) return { error: "Bahan baku tidak ditemukan." };

  const correction = Number(entry.reported_stock) - Number(entry.system_stock_at_report);
  const stockBefore = Number(ingredient.stock);
  const stockAfter = Math.max(0, stockBefore + correction);

  const { error: updateError } = await supabase
    .from("ingredients")
    .update({ stock: stockAfter })
    .eq("id", ingredient.id);
  if (updateError) return { error: updateError.message };

  const { error: adjError } = await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    ingredient_id: ingredient.id,
    item_name: ingredient.name,
    unit: ingredient.unit,
    stock_before: stockBefore,
    stock_after: stockAfter,
    diff: stockAfter - stockBefore,
    reason: "Stock Opname",
    entry_date: entry.entry_date,
    submitted_by_name: entry.submitted_by_name,
  });
  if (adjError) return { error: adjError.message };

  const { error: statusError } = await supabase
    .from("ingredient_opname_entries")
    .update({ status: "verified", verified_at: new Date().toISOString() })
    .eq("id", entryId);
  if (statusError) return { error: statusError.message };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "sukses",
    `Stock Opname diverifikasi: ${ingredient.name}`,
    `Koreksi ${correction >= 0 ? "+" : ""}${correction} ${ingredient.unit} (stok ${stockBefore} -> ${stockAfter})`,
  );

  revalidatePath(`/business/${businessId}/stock-opname`);
  return { error: null };
}

export async function rejectOpnameEntry(businessId: string, entryId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ingredient_opname_entries")
    .update({ status: "rejected", verified_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("business_id", businessId)
    .eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}/stock-opname`);
  return { error: null };
}
