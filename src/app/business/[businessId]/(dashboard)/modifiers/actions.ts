"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addGlobalModifierGroup(
  businessId: string,
  formData: FormData,
) {
  const name = (formData.get("name") as string)?.trim();
  const required = formData.get("required") === "on";
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("global_modifier_groups").insert({ business_id: businessId, name, required });
  revalidatePath(`/business/${businessId}/modifiers`);
}

export async function deleteGlobalModifierGroup(businessId: string, groupId: string) {
  const supabase = await createClient();
  await supabase.from("global_modifier_groups").delete().eq("id", groupId);
  revalidatePath(`/business/${businessId}/modifiers`);
}

export async function addGlobalModifierOption(
  businessId: string,
  groupId: string,
  formData: FormData,
) {
  const name = (formData.get("name") as string)?.trim();
  const priceAdj = parseInt((formData.get("price_adjustment") as string) ?? "0") || 0;
  if (!name) return;
  const supabase = await createClient();
  await supabase.from("global_modifier_options").insert({ group_id: groupId, name, price_adjustment: priceAdj });
  revalidatePath(`/business/${businessId}/modifiers`);
}

export async function deleteGlobalModifierOption(businessId: string, optionId: string) {
  const supabase = await createClient();
  await supabase.from("global_modifier_options").delete().eq("id", optionId);
  revalidatePath(`/business/${businessId}/modifiers`);
}
