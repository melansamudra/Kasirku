"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ActionState = { error: string | null };

// Otorisasi Formal PO (langkah 4 memo) -- ambang nominal (< Rp5jt vs >=
// Rp5jt) cuma ditampilkan sebagai label di UI, belum di-enforce lewat peran
// login terpisah (belum ada login staf per jabatan).
export async function approvePurchaseOrder(
  businessId: string,
  poId: string,
  approverName: string,
): Promise<ActionState> {
  if (!approverName.trim()) {
    return { error: "Pilih nama yang menyetujui PO ini." };
  }

  const supabase = await createClient();

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
    .update({ status: "approved", approved_by: approverName.trim(), approved_at: new Date().toISOString() })
    .eq("id", poId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(supabase, businessId, "produk", "sukses", `PO disetujui: ${po.po_number}`, `Oleh ${approverName.trim()}`);
  revalidatePath(`/business/${businessId}/purchase-orders`);
  revalidatePath(`/business/${businessId}/purchase-orders/${poId}`);
  return { error: null };
}

export async function rejectPurchaseOrder(businessId: string, poId: string, reason: string): Promise<ActionState> {
  if (!reason.trim()) {
    return { error: "Alasan penolakan wajib diisi." };
  }

  const supabase = await createClient();

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

  await logActivity(supabase, businessId, "produk", "warning", `PO ditolak: ${po.po_number}`, reason.trim());
  revalidatePath(`/business/${businessId}/purchase-orders`);
  revalidatePath(`/business/${businessId}/purchase-orders/${poId}`);
  return { error: null };
}
