"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type RegenerateSlugState = { error: string | null; slug: string | null };

export async function regenerateHppMenuSlug(businessId: string): Promise<RegenerateSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase.from("businesses").update({ hpp_menu_slug: slug }).eq("id", businessId);
  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "info", "Link cek HPP menu dibuat/diganti");
  revalidatePath(`/business/${businessId}/reports/hpp-menu`);
  return { error: null, slug };
}
