"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OptionGroupState = { error: string | null };

export async function addOptionGroup(
  businessId: string,
  productId: string,
  _prev: OptionGroupState,
  formData: FormData,
): Promise<OptionGroupState> {
  const name = (formData.get("name") as string)?.trim();
  const required = formData.get("required") === "true";
  if (!name) return { error: "Nama grup wajib diisi." };

  const supabase = await createClient();

  // Verify product belongs to business
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .single();

  if (!product) return { error: "Produk tidak ditemukan." };

  const { data: existing } = await supabase
    .from("product_option_groups")
    .select("sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const { error } = await supabase.from("product_option_groups").insert({
    product_id: productId,
    name,
    required,
    sort_order: (existing?.sort_order ?? -1) + 1,
  });

  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}/products/${productId}/options`);
  return { error: null };
}

export async function deleteOptionGroup(
  businessId: string,
  groupId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("product_option_groups")
    .delete()
    .eq("id", groupId);
  revalidatePath(`/business/${businessId}/products`);
}

export async function addOption(
  businessId: string,
  productId: string,
  groupId: string,
  _prev: OptionGroupState,
  formData: FormData,
): Promise<OptionGroupState> {
  const name = (formData.get("name") as string)?.trim();
  const priceAdj = Number(formData.get("price_adjustment") ?? 0);

  if (!name) return { error: "Nama opsi wajib diisi." };
  if (Number.isNaN(priceAdj)) return { error: "Harga tidak valid." };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("product_options")
    .select("sort_order")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const { error } = await supabase.from("product_options").insert({
    group_id: groupId,
    name,
    price_adjustment: priceAdj,
    sort_order: (existing?.sort_order ?? -1) + 1,
  });

  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}/products/${productId}/options`);
  return { error: null };
}

export async function deleteOption(
  businessId: string,
  productId: string,
  optionId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("product_options").delete().eq("id", optionId);
  revalidatePath(`/business/${businessId}/products/${productId}/options`);
}

export async function toggleGlobalModifier(
  businessId: string,
  productId: string,
  groupId: string,
  linked: boolean,
): Promise<void> {
  const supabase = await createClient();
  if (linked) {
    await supabase.from("product_global_modifier_links").delete()
      .eq("product_id", productId).eq("group_id", groupId);
  } else {
    await supabase.from("product_global_modifier_links").insert({ product_id: productId, group_id: groupId });
  }
  revalidatePath(`/business/${businessId}/products/${productId}/options`);
}

export async function updateOptionGroupName(
  businessId: string,
  productId: string,
  groupId: string,
  name: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("product_option_groups")
    .update({ name })
    .eq("id", groupId);
  revalidatePath(`/business/${businessId}/products/${productId}/options`);
}
