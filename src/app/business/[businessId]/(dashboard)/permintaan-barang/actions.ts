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

export async function assignPurchaseRequestSupplier(
  businessId: string,
  requestId: string,
  supplierId: string,
): Promise<ActionState> {
  if (!supplierId) {
    return { error: "Pilih supplier dulu." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_requests")
    .update({ supplier_id: supplierId })
    .eq("id", requestId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

export async function forwardPurchaseRequestToSupplier(
  businessId: string,
  requestId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, supplier_id, employee_name")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .single();

  if (!request) return { error: "Order tidak ditemukan." };
  if (!request.supplier_id) return { error: "Pilih supplier dulu sebelum diteruskan." };

  const { error } = await supabase
    .from("purchase_requests")
    .update({ status: "diteruskan", forwarded_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    "Order barang diteruskan ke supplier",
    `Dari: ${request.employee_name}`,
  );

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
