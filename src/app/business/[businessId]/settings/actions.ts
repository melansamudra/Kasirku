"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PaymentMethodState = { error: string | null };

export async function addPaymentMethod(
  businessId: string,
  _prevState: PaymentMethodState,
  formData: FormData,
): Promise<PaymentMethodState> {
  const name = (formData.get("name") as string)?.trim();

  if (!name) {
    return { error: "Nama metode pembayaran wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("custom_payment_methods").insert({
    business_id: businessId,
    name,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function deletePaymentMethod(businessId: string, methodId: string) {
  const supabase = await createClient();
  await supabase.from("custom_payment_methods").delete().eq("id", methodId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/settings`);
}

export type KitchenPrinterState = { error: string | null };

export async function addKitchenPrinter(
  businessId: string,
  _prevState: KitchenPrinterState,
  formData: FormData,
): Promise<KitchenPrinterState> {
  const name = (formData.get("name") as string)?.trim();
  const connectionType = formData.get("connectionType") as string;
  const address = (formData.get("address") as string)?.trim();
  const categories = formData.getAll("categories").map((c) => String(c));

  if (!name) {
    return { error: "Nama stasiun printer wajib diisi." };
  }
  if (connectionType !== "bluetooth" && connectionType !== "lan") {
    return { error: "Pilih jenis koneksi dulu." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("kitchen_printers").insert({
    business_id: businessId,
    name,
    connection_type: connectionType,
    address: address || null,
    categories,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function deleteKitchenPrinter(businessId: string, printerId: string) {
  const supabase = await createClient();
  await supabase.from("kitchen_printers").delete().eq("id", printerId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/settings`);
}
