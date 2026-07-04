"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AddCustomerState = { error: string | null };

export async function addCustomer(
  businessId: string,
  _prevState: AddCustomerState,
  formData: FormData,
): Promise<AddCustomerState> {
  const name = (formData.get("name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const note = (formData.get("note") as string)?.trim();

  if (!name) {
    return { error: "Nama pelanggan wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({
    business_id: businessId,
    name,
    phone: phone || null,
    email: email || null,
    note: note || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Nomor telepon sudah dipakai pelanggan lain." };
    }
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "sukses", `Pelanggan baru: ${name}`);
  revalidatePath(`/business/${businessId}/customers`);
  return { error: null };
}

export async function deleteCustomer(businessId: string, customerId: string) {
  const supabase = await createClient();
  await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", customerId)
    .eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/customers`);
}
