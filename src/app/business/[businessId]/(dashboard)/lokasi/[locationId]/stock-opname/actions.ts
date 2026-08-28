"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type RegenerateSlugState = { error: string | null; slug: string | null };

export async function regenerateStockOpnameSlug(
  businessId: string,
  locationId: string,
): Promise<RegenerateSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase.from("businesses").update({ stock_opname_slug: slug }).eq("id", businessId);

  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link stok opname diganti");
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/stock-opname`);
  return { error: null, slug };
}
