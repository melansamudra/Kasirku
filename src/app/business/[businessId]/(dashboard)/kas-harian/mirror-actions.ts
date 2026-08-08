"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleKasMirrorVisibility(
  businessId: string,
  journalLineId: string,
  visible: boolean,
) {
  const supabase = await createClient();
  if (visible) {
    await supabase
      .from("mirror_visible_kas")
      .insert({ business_id: businessId, journal_line_id: journalLineId });
  } else {
    await supabase
      .from("mirror_visible_kas")
      .delete()
      .eq("business_id", businessId)
      .eq("journal_line_id", journalLineId);
  }
  revalidatePath(`/business/${businessId}/kas-harian`);
}
