import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityType = "transaksi" | "produk" | "sistem" | "pengaturan";
export type ActivityStatus = "sukses" | "warning" | "info";

// Pencatatan bersifat best-effort: error insert sengaja diabaikan supaya
// kegagalan menulis log tidak pernah menggagalkan aksi utamanya.
export async function logActivity(
  supabase: SupabaseClient,
  businessId: string,
  type: ActivityType,
  status: ActivityStatus,
  title: string,
  detail?: string,
) {
  await supabase.from("activity_log").insert({
    business_id: businessId,
    type,
    status,
    title,
    detail: detail || null,
  });
}
