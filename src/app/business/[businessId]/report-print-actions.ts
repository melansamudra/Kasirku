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
        .select("id, voided, total, total_item_disc, order_disc_amt")
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

  const txRows = allTx ?? [];
  const nonVoided = txRows.filter((t) => !t.voided);
  // Gunakan transactions.total (sudah dipotong void item) bukan jumlah payments
  const totalSales = nonVoided.reduce((s, t) => s + Number(t.total), 0);
  const grossFromPayments = byMethod.reduce((s, m) => s + m.amount, 0);
  // Selisih ini BUKAN berarti pasti ada void — bisa juga salah input nominal
  // tender. Jangan dianggap void tanpa cek transaction_items.voided langsung.
  const cashGapTotal = Math.max(0, grossFromPayments - totalSales);
  const txCount = nonVoided.length;
  const voidCount = txRows.length - txCount;
  const totalDiscount = nonVoided.reduce(
    (s, t) => s + Number(t.total_item_disc ?? 0) + Number(t.order_disc_amt ?? 0),
    0,
  );

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
    totalDiscount,
    cashGapTotal,
    txCount,
    voidCount,
    shifts,
  });

  return { success: true, jobs: toJobs(printers, buffer) };
}

// Cetak settlement untuk satu shift spesifik (dari halaman Riwayat Shift).
// Filter by shift_id agar akurat meskipun ada transaksi di luar rentang waktu.
export async function buildSingleShiftPrintJobs(
  businessId: string,
  shiftId: string,
): Promise<BuildReportPrintResult> {
  const supabase = await createClient();

  const [{ data: business }, printers, { data: shift }, { data: payments }, { data: txRows }] =
    await Promise.all([
      supabase.from("businesses").select("name").eq("id", businessId).single(),
      getReceiptPrinters(supabase, businessId),
      supabase
        .from("shifts")
        .select(
          "opened_at, closed_at, opening_cash, cash_sales, non_cash_sales, total_sales, tx_count, void_count, difference, cashiers(name)",
        )
        .eq("id", shiftId)
        .single(),
      supabase
        .from("transaction_payments")
        .select("method, amount, transactions!inner(shift_id, voided)")
        .eq("transactions.shift_id", shiftId)
        .eq("transactions.voided", false),
      supabase
        .from("transactions")
        .select("id, voided, total, total_item_disc, order_disc_amt")
        .eq("shift_id", shiftId),
    ]);

  if (!business || !shift) return { success: false, error: "Data tidak ditemukan." };
  if (printers.length === 0) return { success: true, jobs: [] };

  const byMethodMap = new Map<string, number>();
  for (const p of payments ?? []) {
    byMethodMap.set(p.method, (byMethodMap.get(p.method) ?? 0) + Number(p.amount));
  }
  const byMethod = Array.from(byMethodMap.entries())
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => b.amount - a.amount);

  const nonVoided = (txRows ?? []).filter((t) => !t.voided);
  const txCount = nonVoided.length;
  const voidCount = (txRows ?? []).length - txCount;
  const totalDiscount = nonVoided.reduce(
    (s, t) => s + Number(t.total_item_disc ?? 0) + Number(t.order_disc_amt ?? 0),
    0,
  );
  // Gunakan transactions.total (sudah dipotong void item) bukan shift.total_sales
  const totalSalesLive = nonVoided.reduce((s, t) => s + Number(t.total), 0);
  const grossFromPaymentsSingle = byMethod.reduce((s, m) => s + m.amount, 0);
  const cashGapTotalSingle = Math.max(0, grossFromPaymentsSingle - totalSalesLive);

  const openedAt = new Date(shift.opened_at).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const shiftSummary: SettlementShiftRow = {
    cashierName: (shift.cashiers as unknown as { name: string } | null)?.name ?? "Kasir",
    openedAt: shift.opened_at,
    closedAt: shift.closed_at ?? null,
    openingCash: Number(shift.opening_cash),
    totalSales: totalSalesLive,
    cashSales: Number(shift.cash_sales),
    nonCashSales: Number(shift.non_cash_sales),
    txCount: shift.tx_count,
    voidCount: shift.void_count,
    difference: shift.difference !== null ? Number(shift.difference) : null,
  };

  const buffer = buildSettlementTicket({
    businessName: business.name,
    periodLabel: openedAt,
    byMethod,
    totalSales: totalSalesLive,
    totalDiscount,
    cashGapTotal: cashGapTotalSingle,
    txCount,
    voidCount,
    shifts: [shiftSummary],
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
