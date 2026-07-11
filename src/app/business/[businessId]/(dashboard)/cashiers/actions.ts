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

export type EditCashierState = { error: string | null };

export async function editCashier(
  businessId: string,
  cashierId: string,
  _prevState: EditCashierState,
  formData: FormData,
): Promise<EditCashierState> {
  const name = (formData.get("name") as string)?.trim();
  const role = formData.get("role") as string;

  if (!name) {
    return { error: "Nama kasir wajib diisi." };
  }
  if (role !== "kasir" && role !== "manajer") {
    return { error: "Pilih peran kasir dulu." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cashiers")
    .update({ name, role })
    .eq("id", cashierId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "pengaturan", "info", `Kasir diubah: ${name}`);
  revalidatePath(`/business/${businessId}/cashiers`);
  return { error: null };
}

export async function setCashierActive(businessId: string, cashierId: string, active: boolean) {
  const supabase = await createClient();

  const { data: cashier } = await supabase
    .from("cashiers")
    .select("name")
    .eq("id", cashierId)
    .eq("business_id", businessId)
    .maybeSingle();

  await supabase
    .from("cashiers")
    .update({ active })
    .eq("id", cashierId)
    .eq("business_id", businessId);

  if (cashier) {
    await logActivity(
      supabase,
      businessId,
      "pengaturan",
      active ? "sukses" : "warning",
      `Kasir ${active ? "diaktifkan" : "dinonaktifkan"}: ${cashier.name}`,
    );
  }
  revalidatePath(`/business/${businessId}/cashiers`);
}

export type ResetPinState = { error: string | null };

export async function resetCashierPin(
  businessId: string,
  cashierId: string,
  _prevState: ResetPinState,
  formData: FormData,
): Promise<ResetPinState> {
  const pin = formData.get("pin") as string;
  const confirmPin = formData.get("confirmPin") as string;

  if (!/^\d{4}$/.test(pin)) {
    return { error: "PIN harus 4 digit angka." };
  }
  if (pin !== confirmPin) {
    return { error: "PIN dan konfirmasi PIN tidak sama." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_cashier_pin", {
    p_business_id: businessId,
    p_cashier_id: cashierId,
    p_new_pin: pin,
  });

  if (error) {
    return { error: error.message };
  }

  const { data: cashier } = await supabase
    .from("cashiers")
    .select("name")
    .eq("id", cashierId)
    .maybeSingle();

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "warning",
    `PIN direset: ${cashier?.name ?? ""}`,
  );
  revalidatePath(`/business/${businessId}/cashiers`);
  return { error: null };
}
