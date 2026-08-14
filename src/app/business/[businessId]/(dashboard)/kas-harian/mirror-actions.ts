"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleKasMirrorVisibility(
  businessId: string,
  journalLineId: string,
  visible: boolean,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();

    let error;
    if (visible) {
      // upsert + ignoreDuplicates: kalau baris sudah ada (state client basi),
      // jangan gagal dengan duplicate-key error yang bikin toggle "kembali".
      ({ error } = await supabase
        .from("mirror_visible_kas")
        .upsert(
          { business_id: businessId, journal_line_id: journalLineId },
          { onConflict: "business_id,journal_line_id", ignoreDuplicates: true },
        ));
    } else {
      ({ error } = await supabase
        .from("mirror_visible_kas")
        .delete()
        .eq("business_id", businessId)
        .eq("journal_line_id", journalLineId));
    }

    if (error) return { error: `[${error.code ?? "?"}] ${error.message}` };
    revalidatePath(`/business/${businessId}/kas-harian`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? `[exception] ${e.message}` : "Gagal (unknown)." };
  }
}
