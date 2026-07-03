"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AddCashierState = { error: string | null };

export async function addCashier(
  businessId: string,
  _prevState: AddCashierState,
  formData: FormData,
): Promise<AddCashierState> {
  const name = (formData.get("name") as string)?.trim();
  const role = formData.get("role") as string;
  const pin = formData.get("pin") as string;
  const confirmPin = formData.get("confirmPin") as string;

  if (!name) {
    return { error: "Nama kasir wajib diisi." };
  }
  if (role !== "kasir" && role !== "manajer") {
    return { error: "Pilih peran kasir dulu." };
  }
  if (!/^\d{4}$/.test(pin)) {
    return { error: "PIN harus 4 digit angka." };
  }
  if (pin !== confirmPin) {
    return { error: "PIN dan konfirmasi PIN tidak sama." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_cashier", {
    p_business_id: businessId,
    p_name: name,
    p_role: role,
    p_pin: pin,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    `Kasir baru: ${name}`,
    `Peran: ${role}`,
  );
  revalidatePath(`/business/${businessId}/cashiers`);
  return { error: null };
}
