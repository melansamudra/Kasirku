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

export async function forwardItemToSupplier(
  businessId: string,
  requestId: string,
  itemId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("purchase_request_items")
    .select("id, item_name, supplier_id")
    .eq("id", itemId)
    .eq("business_id", businessId)
    .single();

  if (!item) return { error: "Barang tidak ditemukan." };
  if (!item.supplier_id) return { error: "Pilih supplier dulu sebelum diteruskan." };

  const { error } = await supabase
    .from("purchase_request_items")
    .update({ forwarded_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    "Barang order diteruskan ke supplier",
    item.item_name,
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
