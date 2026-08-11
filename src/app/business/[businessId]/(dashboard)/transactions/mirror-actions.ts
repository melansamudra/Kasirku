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
    ({ error } = await supabase
      .from("mirror_visible_transactions")
      .insert({ business_id: businessId, transaction_id: transactionId }));
  } else {
    ({ error } = await supabase
      .from("mirror_visible_transactions")
      .delete()
      .eq("business_id", businessId)
      .eq("transaction_id", transactionId));
  }

  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}/transactions`);
  return {};
}
