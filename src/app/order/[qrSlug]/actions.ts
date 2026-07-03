"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitOrderResult =
  | { success: true }
  | { success: false; error: string };

export async function submitSelfOrder(
  qrSlug: string,
  items: { productId: string; qty: number; note: string | null }[],
): Promise<SubmitOrderResult> {
  if (items.length === 0) {
    return { success: false, error: "Keranjang masih kosong." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_self_order", {
    p_qr_slug: qrSlug,
    p_items: items.map((i) => ({
      product_id: i.productId,
      qty: i.qty,
      note: i.note,
    })),
  });

  if (error) {
    return { success: false, error: "Pesanan gagal terkirim. Coba lagi." };
  }

  return { success: true };
}
