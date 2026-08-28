"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

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
// mengubah stok sistem. Selisihnya dihitung ulang dari stok TERKINI (live)
// di titik ini, bukan dari system_stock_at_report yang cuma snapshot
// informasi saat staf submit -- bisa beda kalau ada pergerakan stok lain
// di antara submit & verifikasi (mis. ada pembelian masuk duluan).
async function applyOpnameEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  entry: {
    id: string;
    component_type: string;
    ingredient_id: string | null;
    semi_finished_item_id: string | null;
    location_id: string;
    item_name: string;
    unit: string;
    reported_stock: number;
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
  } else {
    const { data: row } = await supabase
      .from("semi_finished_item_location_stock")
      .select("stock")
      .eq("business_id", businessId)
      .eq("location_id", entry.location_id)
      .eq("semi_finished_item_id", entry.semi_finished_item_id as string)
      .maybeSingle();
    currentStock = Number(row?.stock ?? 0);
  }

  const diff = Number(entry.reported_stock) - currentStock;
  if (diff !== 0) {
    if (entry.component_type === "ingredient") {
      const { error } = await supabase.from("ingredient_location_stock").upsert(
        {
          business_id: businessId,
          location_id: entry.location_id,
          ingredient_id: entry.ingredient_id as string,
          stock: entry.reported_stock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,ingredient_id" },
      );
      if (error) return error.message;
    } else {
      const { error } = await supabase.from("semi_finished_item_location_stock").upsert(
        {
          business_id: businessId,
          location_id: entry.location_id,
          semi_finished_item_id: entry.semi_finished_item_id as string,
          stock: entry.reported_stock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,semi_finished_item_id" },
      );
      if (error) return error.message;
    }

    const { error: adjError } = await supabase.from("stock_adjustments").insert({
      business_id: businessId,
      ingredient_id: entry.component_type === "ingredient" ? entry.ingredient_id : null,
      semi_finished_item_id: entry.component_type === "semi_finished" ? entry.semi_finished_item_id : null,
      location_id: entry.location_id,
      item_name: entry.item_name,
      unit: entry.unit,
      stock_before: currentStock,
      stock_after: entry.reported_stock,
      diff,
      reason: "Stok opname",
      submitted_by_name: entry.submitted_by_name,
    });
    if (adjError) return adjError.message;
  }

  return null;
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
