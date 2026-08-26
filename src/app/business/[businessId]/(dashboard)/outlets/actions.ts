"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ActionState = { error: string | null };

export async function addOutlet(
  businessId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get("name") as string)?.trim();
  const address = (formData.get("address") as string)?.trim();

  if (!name) {
    return { error: "Nama outlet wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("outlets").insert({
    business_id: businessId,
    name,
    address: address || null,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "sukses", `Outlet baru: ${name}`);
  revalidatePath(`/business/${businessId}/outlets`);
  revalidatePath(`/business/${businessId}/permintaan-resto`);
  return { error: null };
}

export async function updateOutlet(
  businessId: string,
  outletId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get("name") as string)?.trim();
  const address = (formData.get("address") as string)?.trim();

  if (!name) {
    return { error: "Nama outlet wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("outlets")
    .update({ name, address: address || null })
    .eq("id", outletId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "info", `Outlet diubah: ${name}`);
  revalidatePath(`/business/${businessId}/outlets`);
  return { error: null };
}

export async function updateOutletPic(
  businessId: string,
  outletId: string,
  employeeId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("outlets")
    .update({ pic_employee_id: employeeId || null })
    .eq("id", outletId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/outlets`);
  return { error: null };
}

export async function toggleOutletActive(businessId: string, outletId: string, active: boolean) {
  const supabase = await createClient();
  await supabase
    .from("outlets")
    .update({ active })
    .eq("id", outletId)
    .eq("business_id", businessId);

  revalidatePath(`/business/${businessId}/outlets`);
}

export type RegenerateSlugState = { error: string | null; slug: string | null };

export async function regenerateOutletRequestSlug(businessId: string): Promise<RegenerateSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase
    .from("businesses")
    .update({ outlet_request_slug: slug })
    .eq("id", businessId);

  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link permintaan resto diganti");
  revalidatePath(`/business/${businessId}/outlets`);
  return { error: null, slug };
}
