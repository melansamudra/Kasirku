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

export type BulkTableState = { error: string | null; created: number };

export async function addTablesBulk(
  businessId: string,
  _prevState: BulkTableState,
  formData: FormData,
): Promise<BulkTableState> {
  const prefix = (formData.get("prefix") as string)?.trim();
  const start = parseInt((formData.get("start") as string) ?? "1", 10);
  const end = parseInt((formData.get("end") as string) ?? "1", 10);

  if (!prefix) return { error: "Awalan nama meja wajib diisi.", created: 0 };
  if (isNaN(start) || isNaN(end) || start < 1 || end < start)
    return { error: "Rentang nomor tidak valid.", created: 0 };
  if (end - start + 1 > 100)
    return { error: "Maksimal 100 meja sekaligus.", created: 0 };

  const supabase = await createClient();
  const rows = Array.from({ length: end - start + 1 }, (_, i) => ({
    business_id: businessId,
    name: `${prefix}${start + i}`,
    qr_slug: randomBytes(9).toString("base64url"),
  }));

  const { error } = await supabase.from("tables").insert(rows);
  if (error) return { error: error.message, created: 0 };

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    `${rows.length} meja baru: ${rows[0].name}–${rows[rows.length - 1].name}`,
  );
  revalidatePath(`/business/${businessId}/tables`);
  return { error: null, created: rows.length };
}

export async function deleteTable(businessId: string, tableId: string) {
  const supabase = await createClient();
  await supabase.from("tables").delete().eq("id", tableId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/tables`);
}

export async function toggleShowInSelfOrder(businessId: string, productId: string, show: boolean) {
  const supabase = await createClient();
  await supabase
    .from("products")
    .update({ show_in_self_order: show })
    .eq("id", productId)
    .eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/tables`);
}

export async function saveMenuOrder(
  businessId: string,
  items: { id: string; sort_order: number }[],
) {
  const supabase = await createClient();
  await Promise.all(
    items.map((item) =>
      supabase
        .from("products")
        .update({ sort_order: item.sort_order })
        .eq("id", item.id)
        .eq("business_id", businessId),
    ),
  );
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
