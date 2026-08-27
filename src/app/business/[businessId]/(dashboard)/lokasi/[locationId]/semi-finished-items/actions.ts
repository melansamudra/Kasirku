"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AdjustStockResult = { error: string | null };

export async function adjustSemiFinishedLocationStock(
  businessId: string,
  locationId: string,
  semiFinishedItemId: string,
  newStock: number,
  reason: string,
): Promise<AdjustStockResult> {
  if (Number.isNaN(newStock) || newStock < 0) {
    return { error: "Stok fisik harus angka dan tidak boleh negatif." };
  }
  reason = reason.trim();
  if (!reason) {
    return { error: "Alasan penyesuaian wajib diisi." };
  }

  const supabase = await createClient();

  const [{ data: location }, { data: item }, { data: existingRow }] = await Promise.all([
    supabase.from("stock_locations").select("id").eq("id", locationId).eq("business_id", businessId).maybeSingle(),
    supabase
      .from("semi_finished_items")
      .select("id, name, unit")
      .eq("id", semiFinishedItemId)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("semi_finished_item_location_stock")
      .select("id, stock")
      .eq("location_id", locationId)
      .eq("semi_finished_item_id", semiFinishedItemId)
      .maybeSingle(),
  ]);

  if (!location) {
    return { error: "Lokasi tidak ditemukan." };
  }
  if (!item) {
    return { error: "Bahan setengah jadi tidak ditemukan." };
  }

  const stockBefore = Number(existingRow?.stock ?? 0);
  const diff = newStock - stockBefore;

  if (diff === 0) {
    return { error: "Stok fisik sama dengan stok sistem, tidak ada yang disesuaikan." };
  }

  const { error: upsertError } = await supabase.from("semi_finished_item_location_stock").upsert(
    {
      business_id: businessId,
      location_id: locationId,
      semi_finished_item_id: semiFinishedItemId,
      stock: newStock,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "location_id,semi_finished_item_id" },
  );

  if (upsertError) {
    return { error: upsertError.message };
  }

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    semi_finished_item_id: semiFinishedItemId,
    location_id: locationId,
    item_name: item.name,
    unit: item.unit,
    stock_before: stockBefore,
    stock_after: newStock,
    diff,
    reason,
  });

  await logActivity(
    supabase,
    businessId,
    "produk",
    "info",
    `Stok ${item.name} disesuaikan`,
    `${stockBefore} → ${newStock} ${item.unit} (${reason})`,
  );

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/semi-finished-items`);
  return { error: null };
}
