"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { fetchAllRows } from "@/lib/pagination";
import { computeIngredientUsageFromSales } from "@/lib/cost-control/compute-usage";

export type ActionState = { error: string | null };

function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const fromIso = `${period}-01T00:00:00+07:00`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const toIsoExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+07:00`;
  return { fromIso, toIsoExclusive };
}

type TransactionItemRow = { name: string; qty: number };

// Bagian II memo: proyeksi kebutuhan = penjualan bulan acuan x resep (HPP).
// "Penjualan" bisnis cost-control BUKAN transaksi POS asli -- dicatat manual
// lewat "Catat Penjualan" (transactions/new), tapi tetap masuk transactions/
// transaction_items sungguhan. Resolve nama item -> finished_product_id pakai
// pola PERSIS deductOutletStockForSale (transactions/new/actions.ts) --
// cocokkan by name, bukan FK (produk jadi dicerminkan ke katalog products
// pakai nama, tidak ada id langsung).
export async function recalculateFromSales(
  businessId: string,
  targetPeriod: string,
  referencePeriod: string,
): Promise<ActionState> {
  if (!/^\d{4}-\d{2}$/.test(targetPeriod) || !/^\d{4}-\d{2}$/.test(referencePeriod)) {
    return { error: "Periode tidak valid." };
  }

  const supabase = await createClient();
  const { fromIso, toIsoExclusive } = monthRange(referencePeriod);

  const { data: transactionRows } = await supabase
    .from("transactions")
    .select("id")
    .eq("business_id", businessId)
    .eq("voided", false)
    .gte("date", fromIso)
    .lt("date", toIsoExclusive);

  const transactionIds = (transactionRows ?? []).map((t) => t.id);
  const items =
    transactionIds.length > 0
      ? await fetchAllRows<TransactionItemRow>((from, to) =>
          supabase
            .from("transaction_items")
            .select("name, qty")
            .in("transaction_id", transactionIds)
            .range(from, to),
        )
      : [];

  const soldQtyByName = new Map<string, number>();
  for (const it of items) {
    soldQtyByName.set(it.name, (soldQtyByName.get(it.name) ?? 0) + Number(it.qty));
  }

  const { data: finishedProducts } = await supabase
    .from("finished_products")
    .select("id, name")
    .eq("business_id", businessId)
    .is("deleted_at", null);

  const salesQtyByFinishedProductId = new Map<string, number>();
  for (const fp of finishedProducts ?? []) {
    const qty = soldQtyByName.get(fp.name);
    if (qty) salesQtyByFinishedProductId.set(fp.id, qty);
  }

  const usage = await computeIngredientUsageFromSales(supabase, businessId, salesQtyByFinishedProductId);

  const { data: existingLines } = await supabase
    .from("procurement_budget_lines")
    .select("id, ingredient_id, order_qty")
    .eq("business_id", businessId)
    .eq("period", targetPeriod);
  const existingByIngredient = new Map((existingLines ?? []).map((l) => [l.ingredient_id, l]));

  const rows = [...usage.entries()].map(([ingredientId, suggestedQty]) => {
    const existing = existingByIngredient.get(ingredientId);
    return {
      business_id: businessId,
      period: targetPeriod,
      ingredient_id: ingredientId,
      reference_period: referencePeriod,
      suggested_qty: suggestedQty,
      // Baris baru: order_qty default ke suggested_qty (supaya RAB tidak nol
      // sampai Cost Control sadar override). Baris lama: order_qty yang
      // sudah diketik user TIDAK ditimpa -- aman dihitung ulang berkali-kali.
      order_qty: existing ? existing.order_qty : suggestedQty,
      updated_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error } = await supabase
      .from("procurement_budget_lines")
      .upsert(rows, { onConflict: "business_id,period,ingredient_id" });
    if (error) return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "sukses",
    `RAB ${targetPeriod} dihitung ulang dari penjualan ${referencePeriod}`,
    `${rows.length} bahan`,
  );

  revalidatePath(`/business/${businessId}/rab-pembelian`);
  return { error: null };
}

export async function saveBudgetLine(
  businessId: string,
  period: string,
  ingredientId: string,
  orderQty: number,
): Promise<ActionState> {
  if (!Number.isFinite(orderQty) || orderQty < 0) {
    return { error: "Jumlah order harus angka 0 atau lebih." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("procurement_budget_lines").upsert(
    {
      business_id: businessId,
      period,
      ingredient_id: ingredientId,
      order_qty: orderQty,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,period,ingredient_id" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/rab-pembelian`);
  return { error: null };
}
