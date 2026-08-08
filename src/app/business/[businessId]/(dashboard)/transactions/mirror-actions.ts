"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleTransactionMirrorVisibility(
  businessId: string,
  transactionId: string,
  visible: boolean,
) {
  const supabase = await createClient();
  if (visible) {
    await supabase
      .from("mirror_visible_transactions")
      .insert({ business_id: businessId, transaction_id: transactionId });
  } else {
    await supabase
      .from("mirror_visible_transactions")
      .delete()
      .eq("business_id", businessId)
      .eq("transaction_id", transactionId);
  }
  revalidatePath(`/business/${businessId}/transactions`);
}
