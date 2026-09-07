"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveMirrorLink(
  businessId: string,
  toBusinessId: string,
  toCashierId: string,
): Promise<{ error?: string }> {
  try {
    if (!toBusinessId || !toCashierId) {
      return { error: "Pilih toko tujuan dan kasir tujuan." };
    }

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("transaction_mirror_links")
      .select("id")
      .eq("from_business_id", businessId)
      .eq("active", true)
      .maybeSingle();

    const { error } = existing
      ? await supabase
          .from("transaction_mirror_links")
          .update({ to_business_id: toBusinessId, to_cashier_id: toCashierId })
          .eq("id", existing.id)
      : await supabase.from("transaction_mirror_links").insert({
          from_business_id: businessId,
          to_business_id: toBusinessId,
          to_cashier_id: toCashierId,
        });

    if (error) return { error: `[${error.code ?? "?"}] ${error.message}` };

    revalidatePath(`/business/${businessId}/settings`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? `[exception] ${e.message}` : "Gagal (unknown)." };
  }
}

export async function deactivateMirrorLink(
  businessId: string,
  linkId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("transaction_mirror_links")
      .update({ active: false })
      .eq("id", linkId)
      .eq("from_business_id", businessId);

    if (error) return { error: `[${error.code ?? "?"}] ${error.message}` };

    revalidatePath(`/business/${businessId}/settings`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? `[exception] ${e.message}` : "Gagal (unknown)." };
  }
}

export async function saveMirrorProductMapping(
  businessId: string,
  linkId: string,
  fromProductId: string,
  toProductId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = toProductId
      ? await supabase
          .from("transaction_mirror_product_map")
          .upsert(
            { link_id: linkId, from_product_id: fromProductId, to_product_id: toProductId },
            { onConflict: "link_id,from_product_id" },
          )
      : await supabase
          .from("transaction_mirror_product_map")
          .delete()
          .eq("link_id", linkId)
          .eq("from_product_id", fromProductId);

    if (error) return { error: `[${error.code ?? "?"}] ${error.message}` };

    revalidatePath(`/business/${businessId}/settings`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? `[exception] ${e.message}` : "Gagal (unknown)." };
  }
}
