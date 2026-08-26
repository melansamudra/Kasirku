"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ActionState = { error: string | null };

// "Siapkan" = eksekusi langsung (tanpa gerbang approval terpisah, sesuai
// konfirmasi owner: gudang selalu langsung diproses) — memindahkan stok dari
// buffer Gudang Purchasing ke ingredients.stock gudang tujuan, all-or-nothing
// sama pola dengan approveOutletRequest/recordProductionRun.
export async function fulfillWarehouseRequest(
  businessId: string,
  requestId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("warehouse_requests")
    .select("id, status, warehouse_name")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!request) return { error: "Permintaan tidak ditemukan." };
  if (request.status !== "baru") return { error: "Permintaan ini sudah diproses." };

  const { data: items } = await supabase
    .from("warehouse_request_items")
    .select("id, ingredient_id, item_name, unit, qty_requested")
    .eq("warehouse_request_id", requestId);
  if (!items || items.length === 0) return { error: "Permintaan ini tidak punya item." };

  const { data: purchasingWarehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("business_id", businessId)
    .eq("kind", "purchasing")
    .maybeSingle();
  if (!purchasingWarehouse) return { error: "Gudang Purchasing tidak ditemukan." };

  const fulfillQtyById = new Map<string, number>();
  for (const item of items) {
    const raw = formData.get(`qty:${item.id}`) as string | null;
    const qty = raw ? Number(raw) : Number(item.qty_requested);
    if (!(qty > 0)) {
      return { error: `Jumlah untuk ${item.item_name} tidak valid.` };
    }
    fulfillQtyById.set(item.id, qty);
  }

  const shortages: string[] = [];
  const bufferRowById = new Map<string, { id: string; stock: number } | null>();

  for (const item of items) {
    const need = fulfillQtyById.get(item.id) ?? 0;
    if (!item.ingredient_id) {
      shortages.push(`${item.item_name} (bahan sudah dihapus dari katalog)`);
      continue;
    }
    const { data: bufferRow } = await supabase
      .from("warehouse_stock")
      .select("id, stock")
      .eq("warehouse_id", purchasingWarehouse.id)
      .eq("ingredient_id", item.ingredient_id)
      .maybeSingle();
    const available = Number(bufferRow?.stock ?? 0);
    bufferRowById.set(item.id, bufferRow ? { id: bufferRow.id, stock: available } : null);
    if (available < need - 1e-9) {
      shortages.push(`${item.item_name} (butuh ${need}, buffer cuma ${available} ${item.unit})`);
    }
  }

  if (shortages.length > 0) {
    return { error: `Stok buffer tidak cukup: ${shortages.join(", ")}.` };
  }

  for (const item of items) {
    const qty = fulfillQtyById.get(item.id) ?? 0;
    const bufferRow = bufferRowById.get(item.id);

    await supabase.from("warehouse_request_items").update({ qty_fulfilled: qty }).eq("id", item.id);

    if (item.ingredient_id && bufferRow) {
      await supabase.from("warehouse_stock").update({ stock: bufferRow.stock - qty }).eq("id", bufferRow.id);

      const { data: ingredient } = await supabase
        .from("ingredients")
        .select("stock")
        .eq("id", item.ingredient_id)
        .maybeSingle();
      await supabase
        .from("ingredients")
        .update({ stock: Number(ingredient?.stock ?? 0) + qty })
        .eq("id", item.ingredient_id)
        .eq("business_id", businessId);
    }
  }

  await supabase
    .from("warehouse_requests")
    .update({ status: "disiapkan", decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("business_id", businessId);

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Permintaan gudang disiapkan: ${request.warehouse_name}`,
  );

  revalidatePath(`/business/${businessId}/permintaan-gudang`);
  revalidatePath(`/business/${businessId}/warehouses`);
  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}

export async function rejectWarehouseRequest(
  businessId: string,
  requestId: string,
  reason: string,
): Promise<ActionState> {
  if (!reason?.trim()) {
    return { error: "Alasan penolakan wajib diisi." };
  }

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("warehouse_requests")
    .select("id, warehouse_name, status")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!request) return { error: "Permintaan tidak ditemukan." };
  if (request.status !== "baru") return { error: "Permintaan ini sudah diproses." };

  const { error } = await supabase
    .from("warehouse_requests")
    .update({ status: "ditolak", reject_reason: reason.trim(), decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "warning",
    `Permintaan gudang ditolak: ${request.warehouse_name}`,
    reason.trim(),
  );
  revalidatePath(`/business/${businessId}/permintaan-gudang`);
  return { error: null };
}
