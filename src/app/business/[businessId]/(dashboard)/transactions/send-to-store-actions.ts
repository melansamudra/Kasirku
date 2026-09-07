"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function sendTransactionToLinkedStore(
  businessId: string,
  transactionId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("mirror_transaction_to_linked_store", {
      p_business_id: businessId,
      p_transaction_id: transactionId,
    });

    if (error) return { error: `[${error.code ?? "?"}] ${error.message}` };

    revalidatePath(`/business/${businessId}/transactions`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? `[exception] ${e.message}` : "Gagal (unknown)." };
  }
}
