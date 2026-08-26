"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ManualTransactionItemInput = { productId: string; qty: number };

export type CreateManualTransactionResult =
  | { success: true; transactionId: string; invoiceNumber: string }
  | { success: false; error: string };

export async function createManualTransaction(
  businessId: string,
  date: string,
  items: ManualTransactionItemInput[],
  paymentMethod: string,
  received: number | null,
  customerId: string | null,
  outletId: string | null,
): Promise<CreateManualTransactionResult> {
  if (items.length === 0) {
    return { success: false, error: "Keranjang masih kosong." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_manual_transaction", {
      p_business_id: businessId,
      p_date: date,
      p_items: items.map((i) => ({ product_id: i.productId, qty: i.qty })),
      p_payment_method: paymentMethod,
      p_received: received,
      p_customer_id: customerId,
    })
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal menyimpan transaksi." };
  }

  const result = data as { transaction_id: string; invoice_number: string };

  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);
  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "info",
    `Transaksi manual ${result.invoice_number}`,
    `${itemCount} item · ${paymentMethod}`,
  );

  if (outletId) {
    await deductOutletStockForSale(supabase, businessId, outletId, items);
  }

  return {
    success: true,
    transactionId: result.transaction_id,
    invoiceNumber: result.invoice_number,
  };
}

// Penjualan produk jadi di resto/bar memakai bahan setengah jadi yang sudah
// dikirim ke outlet itu (lihat outlet_stock) — jadi mengurangi saldo
// outlet_stock sesuai resep (finished_product_recipes) x qty terjual.
// Best-effort & tidak membatalkan penjualan yang sudah tersimpan kalau
// stok outlet ternyata kurang (di-floor ke 0, sama pola dengan void
// purchase) — pencatatan transaksi tetap jadi prioritas, koreksi stok bisa
// disesuaikan manual lewat halaman Outlet kalau perlu.
async function deductOutletStockForSale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  outletId: string,
  items: ManualTransactionItemInput[],
) {
  const productIds = items.map((i) => i.productId);
  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .in("id", productIds);
  const nameByProductId = new Map((products ?? []).map((p) => [p.id, p.name]));

  const { data: finishedProducts } = await supabase
    .from("finished_products")
    .select("id, name")
    .eq("business_id", businessId);
  const finishedIdByName = new Map((finishedProducts ?? []).map((f) => [f.name, f.id]));

  const finishedIds = items
    .map((i) => finishedIdByName.get(nameByProductId.get(i.productId) ?? ""))
    .filter((id): id is string => !!id);
  if (finishedIds.length === 0) return;

  const { data: recipeRows } = await supabase
    .from("finished_product_recipes")
    .select("finished_product_id, semi_finished_item_id, qty")
    .eq("business_id", businessId)
    .eq("component_type", "semi_finished")
    .in("finished_product_id", finishedIds);

  const neededBySemiId = new Map<string, number>();
  for (const item of items) {
    const productName = nameByProductId.get(item.productId);
    const finishedId = productName ? finishedIdByName.get(productName) : undefined;
    if (!finishedId) continue;
    for (const recipe of recipeRows ?? []) {
      if (recipe.finished_product_id !== finishedId || !recipe.semi_finished_item_id) continue;
      const need = Number(recipe.qty) * item.qty;
      neededBySemiId.set(
        recipe.semi_finished_item_id,
        (neededBySemiId.get(recipe.semi_finished_item_id) ?? 0) + need,
      );
    }
  }

  for (const [semiFinishedItemId, needed] of neededBySemiId) {
    const { data: stockRow } = await supabase
      .from("outlet_stock")
      .select("id, stock")
      .eq("outlet_id", outletId)
      .eq("semi_finished_item_id", semiFinishedItemId)
      .maybeSingle();
    if (!stockRow) continue;
    await supabase
      .from("outlet_stock")
      .update({ stock: Math.max(0, Number(stockRow.stock) - needed) })
      .eq("id", stockRow.id);
  }
}
