"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ActionState = { error: string | null };

export async function receivePurchaseRequest(
  businessId: string,
  requestId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_requests")
    .update({ status: "diterima", received_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("business_id", businessId)
    .eq("status", "baru");

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

export async function assignItemSupplier(
  businessId: string,
  itemId: string,
  supplierId: string,
): Promise<ActionState> {
  if (!supplierId) {
    return { error: "Pilih supplier dulu." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_request_items")
    .update({ supplier_id: supplierId })
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

export async function updateItemApprovedQty(
  businessId: string,
  itemId: string,
  approvedQty: number,
): Promise<ActionState> {
  if (!Number.isFinite(approvedQty) || approvedQty < 0) {
    return { error: "Qty disetujui harus angka 0 atau lebih." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_request_items")
    .update({ approved_qty: approvedQty })
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

// Diteruskan per SUPPLIER, bukan per barang — kalau satu order punya 10
// barang buat supplier yang sama, ini satu kali panggilan (satu WA, satu
// "invoice") yang menandai forwarded_at ke-10 barang itu sekaligus, bukan
// 10 kali forward terpisah.
export async function forwardItemsToSupplier(
  businessId: string,
  requestId: string,
  itemIds: string[],
): Promise<ActionState> {
  if (itemIds.length === 0) {
    return { error: "Tidak ada barang yang dipilih." };
  }

  const supabase = await createClient();

  const { data: items } = await supabase
    .from("purchase_request_items")
    .select("id, item_name, supplier_id")
    .in("id", itemIds)
    .eq("business_id", businessId)
    .eq("purchase_request_id", requestId);

  if (!items || items.length === 0) return { error: "Barang tidak ditemukan." };

  const supplierId = items[0].supplier_id;
  if (!supplierId || items.some((it) => it.supplier_id !== supplierId)) {
    return { error: "Semua barang yang diteruskan bareng harus punya supplier yang sama." };
  }

  const { error } = await supabase
    .from("purchase_request_items")
    .update({ forwarded_at: new Date().toISOString() })
    .in("id", itemIds)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    "Order barang diteruskan ke supplier",
    `${items.length} barang: ${items.map((i) => i.item_name).join(", ")}`,
  );

  // Kalau semua barang di order ini sudah diteruskan, tandai order-nya
  // selesai supaya badge "order baru menunggu" tidak menghitung dia lagi.
  const { data: remaining } = await supabase
    .from("purchase_request_items")
    .select("id")
    .eq("purchase_request_id", requestId)
    .eq("business_id", businessId)
    .is("forwarded_at", null);

  if (remaining && remaining.length === 0) {
    await supabase
      .from("purchase_requests")
      .update({ status: "diteruskan", forwarded_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("business_id", businessId);
  }

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

export type RegenerateSlugState = { error: string | null; slug: string | null };

export async function regeneratePurchaseRequestSlug(
  businessId: string,
): Promise<RegenerateSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase
    .from("businesses")
    .update({ purchase_request_slug: slug })
    .eq("id", businessId);

  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link order barang diganti");
  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null, slug };
}
