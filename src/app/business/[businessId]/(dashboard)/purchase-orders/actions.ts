"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getCurrentActor, canApprovePo } from "@/lib/current-actor";

export type ActionState = { error: string | null };

export async function approvePurchaseOrder(businessId: string, poId: string): Promise<ActionState> {
  const supabase = await createClient();

  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };
  if (!canApprovePo(actor)) {
    return { error: "Akun Anda tidak punya izin Setujui PO. Minta Owner aktifkan permission ini." };
  }

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status, issued_by_user_id")
    .eq("id", poId)
    .eq("business_id", businessId)
    .single();
  if (!po) return { error: "PO tidak ditemukan." };
  if (po.status !== "issued") return { error: "PO ini sudah diproses sebelumnya." };
  if (po.issued_by_user_id && po.issued_by_user_id === actor.userId) {
    return { error: "Tidak bisa menyetujui PO yang Anda terbitkan sendiri." };
  }

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "approved",
      approved_by: actor.name,
      approved_by_user_id: actor.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", poId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(supabase, businessId, "produk", "sukses", `PO disetujui: ${po.po_number}`, `Oleh ${actor.name}`);
  revalidatePath(`/business/${businessId}/purchase-orders`);
  revalidatePath(`/business/${businessId}/purchase-orders/${poId}`);
  return { error: null };
}

export async function rejectPurchaseOrder(businessId: string, poId: string, reason: string): Promise<ActionState> {
  if (!reason.trim()) {
    return { error: "Alasan penolakan wajib diisi." };
  }

  const supabase = await createClient();

  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };
  if (!canApprovePo(actor)) {
    return { error: "Akun Anda tidak punya izin Setujui PO. Minta Owner aktifkan permission ini." };
  }

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status")
    .eq("id", poId)
    .eq("business_id", businessId)
    .single();
  if (!po) return { error: "PO tidak ditemukan." };
  if (po.status !== "issued") return { error: "PO ini sudah diproses sebelumnya." };

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "rejected", note: reason.trim() })
    .eq("id", poId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(supabase, businessId, "produk", "warning", `PO ditolak: ${po.po_number}`, `Oleh ${actor.name} — ${reason.trim()}`);
  revalidatePath(`/business/${businessId}/purchase-orders`);
  revalidatePath(`/business/${businessId}/purchase-orders/${poId}`);
  return { error: null };
}
