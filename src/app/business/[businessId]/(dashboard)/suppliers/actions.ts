"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AddSupplierState = { error: string | null; supplierId: string | null };

export async function addSupplier(
  businessId: string,
  _prevState: AddSupplierState,
  formData: FormData,
): Promise<AddSupplierState> {
  const name = (formData.get("name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const address = (formData.get("address") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim();
  const bankName = (formData.get("bankName") as string)?.trim();
  const bankAccountNumber = (formData.get("bankAccountNumber") as string)?.trim();
  const bankAccountHolder = (formData.get("bankAccountHolder") as string)?.trim();

  if (!name) {
    return { error: "Nama supplier wajib diisi.", supplierId: null };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("suppliers")
    .insert({
      business_id: businessId,
      name,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      bank_name: bankName || null,
      bank_account_number: bankAccountNumber || null,
      bank_account_holder: bankAccountHolder || null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message, supplierId: null };
  }

  await logActivity(supabase, businessId, "produk", "sukses", `Supplier baru: ${name}`);
  revalidatePath(`/business/${businessId}/suppliers`);
  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/purchases/laporan-hutang`);
  return { error: null, supplierId: inserted.id };
}

export type EditSupplierState = { error: string | null };

export async function editSupplier(
  businessId: string,
  supplierId: string,
  _prevState: EditSupplierState,
  formData: FormData,
): Promise<EditSupplierState> {
  const name = (formData.get("name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const address = (formData.get("address") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim();
  const bankName = (formData.get("bankName") as string)?.trim();
  const bankAccountNumber = (formData.get("bankAccountNumber") as string)?.trim();
  const bankAccountHolder = (formData.get("bankAccountHolder") as string)?.trim();

  if (!name) {
    return { error: "Nama supplier wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      bank_name: bankName || null,
      bank_account_number: bankAccountNumber || null,
      bank_account_holder: bankAccountHolder || null,
    })
    .eq("id", supplierId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "info", `Supplier diubah: ${name}`);
  revalidatePath(`/business/${businessId}/suppliers`);
  revalidatePath(`/business/${businessId}/purchases`);
  return { error: null };
}

export async function deleteSupplier(businessId: string, supplierId: string) {
  const supabase = await createClient();

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("name")
    .eq("id", supplierId)
    .eq("business_id", businessId)
    .maybeSingle();

  await supabase
    .from("suppliers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", supplierId)
    .eq("business_id", businessId);

  if (supplier) {
    await logActivity(supabase, businessId, "produk", "warning", `Supplier dihapus: ${supplier.name}`);
  }
  revalidatePath(`/business/${businessId}/suppliers`);
  revalidatePath(`/business/${businessId}/purchases`);
}
