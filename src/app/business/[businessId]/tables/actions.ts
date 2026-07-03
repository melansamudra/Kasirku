"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type TableState = { error: string | null };

export async function addTable(
  businessId: string,
  _prevState: TableState,
  formData: FormData,
): Promise<TableState> {
  const name = (formData.get("name") as string)?.trim();

  if (!name) {
    return { error: "Nama meja wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tables").insert({
    business_id: businessId,
    name,
    qr_slug: randomBytes(9).toString("base64url"),
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "pengaturan", "sukses", `Meja baru: ${name}`);
  revalidatePath(`/business/${businessId}/tables`);
  return { error: null };
}

export async function deleteTable(businessId: string, tableId: string) {
  const supabase = await createClient();
  await supabase.from("tables").delete().eq("id", tableId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/tables`);
}

export async function setSelfOrderStatus(
  businessId: string,
  orderId: string,
  status: "diproses" | "selesai",
) {
  const supabase = await createClient();
  await supabase
    .from("self_orders")
    .update({ status })
    .eq("id", orderId)
    .eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/tables`);
}
