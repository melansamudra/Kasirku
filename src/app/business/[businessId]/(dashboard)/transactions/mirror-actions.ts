"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleTransactionMirrorVisibility(
  businessId: string,
  transactionId: string,
  visible: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  let error;
  if (visible) {
    // upsert + ignoreDuplicates: kalau baris sudah ada (mis. state client basi
    // karena tab lain / cache), jangan gagal dengan duplicate-key error yang
    // bikin toggle keliatan "kembali" padahal datanya sudah benar di DB.
    ({ error } = await supabase
      .from("mirror_visible_transactions")
      .upsert(
        { business_id: businessId, transaction_id: transactionId },
        { onConflict: "business_id,transaction_id", ignoreDuplicates: true },
      ));
  } else {
    ({ error } = await supabase
      .from("mirror_visible_transactions")
      .delete()
      .eq("business_id", businessId)
      .eq("transaction_id", transactionId));
  }

  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}/transactions`);
  revalidatePath(`/business/${businessId}/mirror`);
  return {};
}
