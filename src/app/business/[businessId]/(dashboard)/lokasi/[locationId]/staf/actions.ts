"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type RegeneratePortalSlugState = { error: string | null; slug: string | null };

export async function regeneratePortalSlug(
  businessId: string,
  locationId: string,
): Promise<RegeneratePortalSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase
    .from("stock_locations")
    .update({ portal_slug: slug })
    .eq("id", locationId)
    .eq("business_id", businessId);

  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link Portal Lokasi diganti");
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/staf`);
  return { error: null, slug };
}
