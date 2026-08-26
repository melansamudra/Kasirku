"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { computeSemiFinishedItemCost } from "@/lib/cost-control/compute-cost";

export type ActionState = { error: string | null };

// Beda dari approvePurchaseRequestItem (yang butuh alokasi ke supplier
// eksternal): sumber di sini selalu satu (stok dapur pusat sendiri), jadi
// cukup satu langkah — admin sesuaikan qty disetujui per item lalu setujui
// sekaligus. Cek stok cukup untuk SEMUA item dulu (all-or-nothing) sebelum
// menyentuh stok apa pun, sama pola dengan recordProductionRun.
export async function approveOutletRequest(
  businessId: string,
  requestId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("outlet_requests")
    .select("id, status, outlet_id, outlet_name")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!request) return { error: "Permintaan tidak ditemukan." };
  if (request.status !== "baru") return { error: "Permintaan ini sudah diproses." };

  const { data: items } = await supabase
    .from("outlet_request_items")
    .select("id, semi_finished_item_id, item_name, unit, qty_requested")
    .eq("outlet_request_id", requestId);
  if (!items || items.length === 0) return { error: "Permintaan ini tidak punya item." };

  const approvedQtyById = new Map<string, number>();
  for (const item of items) {
    const raw = formData.get(`approvedQty:${item.id}`) as string | null;
    const qty = raw ? Number(raw) : Number(item.qty_requested);
    if (!(qty > 0)) {
      return { error: `Jumlah untuk ${item.item_name} tidak valid.` };
    }
    approvedQtyById.set(item.id, qty);
  }

  const shortages: string[] = [];
  const unitCostById = new Map<string, number>();
  const stockById = new Map<string, number>();

  for (const item of items) {
    const need = approvedQtyById.get(item.id) ?? 0;
    if (!item.semi_finished_item_id) {
      shortages.push(`${item.item_name} (bahan sudah dihapus dari katalog)`);
      continue;
    }
    const { data: semi } = await supabase
      .from("semi_finished_items")
      .select("stock")
      .eq("id", item.semi_finished_item_id)
      .maybeSingle();
    const available = Number(semi?.stock ?? 0);
    const cost = await computeSemiFinishedItemCost(supabase, businessId, item.semi_finished_item_id);
    stockById.set(item.id, available);
    unitCostById.set(item.id, cost.unitCost);
    if (available < need - 1e-9) {
      shortages.push(`${item.item_name} (butuh ${need}, tersedia ${available} ${item.unit})`);
    }
  }

  if (shortages.length > 0) {
    return { error: `Stok tidak cukup: ${shortages.join(", ")}.` };
  }

  for (const item of items) {
    const qty = approvedQtyById.get(item.id) ?? 0;
    const unitCost = unitCostById.get(item.id) ?? 0;
    const value = qty * unitCost;

    await supabase.from("outlet_request_items").update({ qty_approved: qty, value }).eq("id", item.id);

    if (item.semi_finished_item_id) {
      await supabase
        .from("semi_finished_items")
        .update({ stock: (stockById.get(item.id) ?? 0) - qty })
        .eq("id", item.semi_finished_item_id)
        .eq("business_id", businessId);

      // Saldo "Stock Resto/Bar" — bertambah di outlet tujuan setiap kali
      // permintaan disetujui. Terpisah dari stok gudang pusat di atas.
      if (request.outlet_id) {
        const { data: existing } = await supabase
          .from("outlet_stock")
          .select("id, stock")
          .eq("outlet_id", request.outlet_id)
          .eq("semi_finished_item_id", item.semi_finished_item_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("outlet_stock")
            .update({ stock: Number(existing.stock) + qty })
            .eq("id", existing.id);
        } else {
          await supabase.from("outlet_stock").insert({
            business_id: businessId,
            outlet_id: request.outlet_id,
            semi_finished_item_id: item.semi_finished_item_id,
            stock: qty,
          });
        }
      }
    }
  }

  await supabase
    .from("outlet_requests")
    .update({ status: "disetujui", decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("business_id", businessId);

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Permintaan resto disetujui: ${request.outlet_name}`,
  );

  revalidatePath(`/business/${businessId}/permintaan-resto`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/outlets`);
  return { error: null };
}

export async function rejectOutletRequest(businessId: string, requestId: string, reason: string): Promise<ActionState> {
  if (!reason?.trim()) {
    return { error: "Alasan penolakan wajib diisi." };
  }

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("outlet_requests")
    .select("id, outlet_name, status")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!request) return { error: "Permintaan tidak ditemukan." };
  if (request.status !== "baru") return { error: "Permintaan ini sudah diproses." };

  const { error } = await supabase
    .from("outlet_requests")
    .update({ status: "ditolak", reject_reason: reason.trim(), decided_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(supabase, businessId, "produk", "warning", `Permintaan resto ditolak: ${request.outlet_name}`, reason.trim());
  revalidatePath(`/business/${businessId}/permintaan-resto`);
  return { error: null };
}
