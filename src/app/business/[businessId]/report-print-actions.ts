"use server";

import { createClient } from "@/lib/supabase/server";
import { buildSettlementTicket, buildMenuSalesTicket, type SettlementShiftRow } from "@/lib/escpos";
import type { KitchenPrintJobPayload } from "@/lib/kitchen-print";

export type BuildReportPrintResult =
  | { success: true; jobs: KitchenPrintJobPayload[] }
  | { success: false; error: string };

// Printer(s) ditandai prints_receipt di Pengaturan — sama seperti target
// struk pelanggan (lihat pos/actions.ts buildReceiptPrintJobsForTransaction)
// — dipakai ulang di sini karena laporan ini juga barang kasir/pemilik,
// bukan tiket dapur/bar.
async function getReceiptPrinters(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
) {
  const { data: printers } = await supabase
    .from("kitchen_printers")
    .select("name, connection_type, address")
    .eq("business_id", businessId)
    .eq("prints_receipt", true)
    .not("address", "is", null);
  return printers ?? [];
}

function toJobs(
  printers: { name: string; connection_type: string; address: string | null }[],
  buffer: Buffer,
): KitchenPrintJobPayload[] {
  const bytesBase64 = buffer.toString("base64");
  return printers.map((p) => ({
    printerName: p.name,
    address: p.address as string,
    connectionType: p.connection_type as "lan" | "bluetooth",
    bytesBase64,
  }));
}

// Rekap penjualan per metode bayar (Tunai/QRIS/EDC/dst) untuk satu rentang
// tanggal — dipakai baik dari Halaman Laporan (rentang bebas) maupun
// pintasan setelah tutup shift (rentang "hari ini"). Agregasinya sengaja
// dihitung ulang di sini dengan cara yang sama seperti reports/page.tsx
// (byMethod), supaya angka yang tercetak selalu cocok dengan yang tampil
// di layar.
export async function buildSettlementPrintJobs(
  businessId: string,
  fromIso: string | null,
  toIsoExclusive: string | null,
  periodLabel: string,
): Promise<BuildReportPrintResult> {
  const supabase = await createClient();

  const [{ data: business }, printers, { data: payments }, { data: allTx }, { data: shiftRows }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", businessId).single(),
    getReceiptPrinters(supabase, businessId),
    (() => {
      let q = supabase
        .from("transaction_payments")
        .select("method, amount, transactions!inner(business_id, date, voided)")
        .eq("transactions.business_id", businessId)
        .eq("transactions.voided", false);
      if (fromIso) q = q.gte("transactions.date", fromIso);
      if (toIsoExclusive) q = q.lt("transactions.date", toIsoExclusive);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("transactions")
        .select("id, voided")
        .eq("business_id", businessId);
      if (fromIso) q = q.gte("date", fromIso);
      if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
      return q;
    })(),
    (() => {
      let q = supabase
        .from("shifts")
        .select("opened_at, closed_at, opening_cash, cash_sales, non_cash_sales, total_sales, tx_count, void_count, difference, cashiers(name)")
        .eq("business_id", businessId)
        .order("opened_at", { ascending: true });
      if (fromIso) q = q.gte("opened_at", fromIso);
      if (toIsoExclusive) q = q.lt("opened_at", toIsoExclusive);
      return q;
    })(),
  ]);

  if (!business) {
    return { success: false, error: "Toko tidak ditemukan." };
  }
  if (printers.length === 0) {
    return { success: true, jobs: [] };
  }

  const byMethodMap = new Map<string, number>();
  for (const p of payments ?? []) {
    byMethodMap.set(p.method, (byMethodMap.get(p.method) ?? 0) + Number(p.amount));
  }
  const byMethod = Array.from(byMethodMap.entries())
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount);
  const totalSales = byMethod.reduce((s, m) => s + m.amount, 0);

  const txRows = allTx ?? [];
  const txCount = txRows.filter((t) => !t.voided).length;
  const voidCount = txRows.length - txCount;

  const shifts: SettlementShiftRow[] = (shiftRows ?? []).map((s) => ({
    cashierName: (s.cashiers as unknown as { name: string } | null)?.name ?? "Kasir",
    openedAt: s.opened_at,
    closedAt: s.closed_at ?? null,
    openingCash: Number(s.opening_cash),
    totalSales: Number(s.total_sales),
    cashSales: Number(s.cash_sales),
    nonCashSales: Number(s.non_cash_sales),
    txCount: s.tx_count,
    voidCount: s.void_count,
    difference: s.difference !== null ? Number(s.difference) : null,
  }));

  const buffer = buildSettlementTicket({
    businessName: business.name,
    periodLabel,
    byMethod,
    totalSales,
    txCount,
    voidCount,
    shifts,
  });

  return { success: true, jobs: toJobs(printers, buffer) };
}

// Rekap menu terjual (nama/qty/omzet) untuk satu rentang tanggal — sama
// pola dengan buildSettlementPrintJobs di atas, urut by omzet desc seperti
// "Menu Terlaris" di Halaman Laporan.
export async function buildMenuSalesPrintJobs(
  businessId: string,
  fromIso: string | null,
  toIsoExclusive: string | null,
  periodLabel: string,
): Promise<BuildReportPrintResult> {
  const supabase = await createClient();

  const [{ data: business }, printers, { data: items }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", businessId).single(),
    getReceiptPrinters(supabase, businessId),
    (() => {
      let q = supabase
        .from("transaction_items")
        .select("name, qty, price, transactions!inner(business_id, date, voided)")
        .eq("transactions.business_id", businessId)
        .eq("transactions.voided", false);
      if (fromIso) q = q.gte("transactions.date", fromIso);
      if (toIsoExclusive) q = q.lt("transactions.date", toIsoExclusive);
      return q;
    })(),
  ]);

  if (!business) {
    return { success: false, error: "Toko tidak ditemukan." };
  }
  if (printers.length === 0) {
    return { success: true, jobs: [] };
  }

  const byNameMap = new Map<string, { qty: number; amount: number }>();
  for (const i of items ?? []) {
    const cur = byNameMap.get(i.name) ?? { qty: 0, amount: 0 };
    cur.qty += Number(i.qty);
    cur.amount += Number(i.qty) * Number(i.price);
    byNameMap.set(i.name, cur);
  }
  const menuItems = Array.from(byNameMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amount - a.amount);
  const totalQty = menuItems.reduce((s, m) => s + m.qty, 0);
  const totalAmount = menuItems.reduce((s, m) => s + m.amount, 0);

  const buffer = buildMenuSalesTicket({
    businessName: business.name,
    periodLabel,
    items: menuItems,
    totalQty,
    totalAmount,
  });

  return { success: true, jobs: toJobs(printers, buffer) };
}
