import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  getPeriodRange,
  parsePeriod,
} from "../reports/period";
import PeriodTabs from "../reports/period-tabs";
import { addExpense, addReconciliation, setOpeningInventory } from "./actions";
import AddExpenseForm from "./add-expense-form";
import AddReconciliationForm from "./add-reconciliation-form";
import DeleteExpenseButton from "./delete-expense-button";
import MerchantFeeInput from "./merchant-fee-input";
import SetOpeningInventoryForm from "./set-opening-inventory-form";

const PURCHASE_INGREDIENT_CATEGORY = "Pembelian Bahan Baku";
const PURCHASE_PRODUCT_CATEGORY = "Pembelian Barang Dagang";
const PAYMENT_METHODS = ["Tunai", "Kartu", "QRIS"];

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

function getPreviousMonthLastDayStr(): string {
  const now = new Date();
  // Day 0 of the current UTC month == last day of the previous month.
  return toDateStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));
}

export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam, from, to } = await searchParams;
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);

  const supabase = await createClient();
  const today = todayWibDateString();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, business_type")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const isFnb = business.business_type === "fnb";

  const boundAddExpense = addExpense.bind(null, businessId);
  const boundAddReconciliation = addReconciliation.bind(null, businessId);
  const anchorDate = getPreviousMonthLastDayStr();
  const boundSetOpeningInventory = setOpeningInventory.bind(null, businessId, anchorDate);

  // ── Transaksi periode ini (untuk pendapatan, COGS teori, rekonsiliasi) ──
  let txQuery = supabase
    .from("transactions")
    .select("total, total_cost, transaction_payments(method, amount)")
    .eq("business_id", businessId)
    .eq("voided", false);
  if (fromIso) txQuery = txQuery.gte("date", fromIso);
  if (toIsoExclusive) txQuery = txQuery.lt("date", toIsoExclusive);
  const { data: transactions } = await txQuery;

  const revenue = (transactions ?? []).reduce((s, t) => s + Number(t.total), 0);
  const cogsTeori = (transactions ?? []).reduce((s, t) => s + Number(t.total_cost), 0);

  const byMethod = new Map<string, { count: number; totalPOS: number }>();
  for (const t of transactions ?? []) {
    for (const p of t.transaction_payments ?? []) {
      const entry = byMethod.get(p.method) ?? { count: 0, totalPOS: 0 };
      entry.count += 1;
      entry.totalPOS += Number(p.amount);
      byMethod.set(p.method, entry);
    }
  }

  // ── Pengeluaran periode ini ──
  let expQuery = supabase
    .from("expenses")
    .select("id, date, category, amount, note, qty")
    .eq("business_id", businessId)
    .order("date", { ascending: false });
  // expenses.date is a plain date column; timestamptz bounds are trimmed to
  // their date part so both queries stay aligned to the same WIB period.
  if (fromIso) expQuery = expQuery.gte("date", fromIso.slice(0, 10));
  if (toIsoExclusive) expQuery = expQuery.lt("date", toIsoExclusive.slice(0, 10));
  const { data: expenses } = await expQuery;

  const purchaseExpenses = (expenses ?? []).filter(
    (e) => e.category === PURCHASE_INGREDIENT_CATEGORY || e.category === PURCHASE_PRODUCT_CATEGORY,
  );
  const totalPembelian = purchaseExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const otherExpenses = (expenses ?? []).filter(
    (e) => e.category !== PURCHASE_INGREDIENT_CATEGORY && e.category !== PURCHASE_PRODUCT_CATEGORY,
  );
  const totalOtherExp = otherExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // ── Rekonsiliasi & biaya merchant ──
  const { data: merchantFeeRows } = await supabase
    .from("merchant_fees")
    .select("method, fee_percent")
    .eq("business_id", businessId);
  const merchantFeeMap = new Map((merchantFeeRows ?? []).map((r) => [r.method, Number(r.fee_percent)]));

  let reconQuery = supabase
    .from("reconciliations")
    .select("method, actual_amount")
    .eq("business_id", businessId);
  if (fromIso) reconQuery = reconQuery.gte("date", fromIso.slice(0, 10));
  if (toIsoExclusive) reconQuery = reconQuery.lt("date", toIsoExclusive.slice(0, 10));
  const { data: reconciliations } = await reconQuery;

  const reconciliationRows = Array.from(byMethod.entries())
    .map(([method, { count, totalPOS }]) => {
      const feePct = merchantFeeMap.get(method) ?? 0;
      const merchantFee = Math.round((totalPOS * feePct) / 100);
      const estimasiNet = totalPOS - merchantFee;
      const matching = (reconciliations ?? []).filter((r) => r.method === method);
      const hasActual = matching.length > 0;
      const actualReceived = matching.reduce((s, r) => s + Number(r.actual_amount), 0);
      const selisih = hasActual ? actualReceived - estimasiNet : null;
      return { method, count, totalPOS, feePct, merchantFee, estimasiNet, actualReceived, hasActual, selisih };
    })
    .sort((a, b) => b.totalPOS - a.totalPOS);

  const reconTotals = reconciliationRows.reduce(
    (acc, r) => ({
      totalPOS: acc.totalPOS + r.totalPOS,
      merchantFee: acc.merchantFee + r.merchantFee,
      estimasiNet: acc.estimasiNet + r.estimasiNet,
      actualReceived: acc.actualReceived + (r.hasActual ? r.actualReceived : 0),
    }),
    { totalPOS: 0, merchantFee: 0, estimasiNet: 0, actualReceived: 0 },
  );

  const reconMethods = Array.from(
    new Set([...PAYMENT_METHODS, ...Array.from(byMethod.keys())]),
  );

  const { data: openShift } = await supabase
    .from("shifts")
    .select("id")
    .eq("business_id", businessId)
    .is("closed_at", null)
    .limit(1)
    .maybeSingle();

  // ── Kontrol HPP teori vs aktual (persediaan) ──
  const { data: ingredientsForCost } = await supabase
    .from("ingredients")
    .select("id, name, unit, stock, unit_cost")
    .eq("business_id", businessId)
    .is("deleted_at", null);
  const { data: productsForCost } = await supabase
    .from("products")
    .select("id, name, stock, cost")
    .eq("business_id", businessId)
    .is("deleted_at", null);

  const ingredientsValue = (ingredientsForCost ?? []).reduce(
    (s, i) => s + Number(i.stock) * Number(i.unit_cost),
    0,
  );
  const productsValue = (productsForCost ?? []).reduce((s, p) => s + Number(p.stock) * Number(p.cost), 0);
  const closingValue = ingredientsValue + productsValue;

  let openingValue: number | null = null;
  if (fromIso) {
    const dayBefore = addDaysStr(fromIso.slice(0, 10), -1);
    const { data: snapshot } = await supabase
      .from("inventory_snapshots")
      .select("value")
      .eq("business_id", businessId)
      .lte("date", dayBefore)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    openingValue = snapshot ? Number(snapshot.value) : null;
  } else {
    const { data: snapshot } = await supabase
      .from("inventory_snapshots")
      .select("value")
      .eq("business_id", businessId)
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle();
    openingValue = snapshot ? Number(snapshot.value) : null;
  }
  const usedFallback = openingValue === null;
  if (openingValue === null) openingValue = closingValue;

  const cogsAktual = openingValue + totalPembelian - closingValue;
  const netProfit = revenue - cogsAktual - totalOtherExp;

  const selisih = cogsAktual - cogsTeori;
  const selisihPct = cogsTeori > 0 ? Math.round((selisih / cogsTeori) * 100) : 0;

  let selisihBoxClass = "bg-zinc-100 text-zinc-500";
  let selisihNote = "";
  if (usedFallback) {
    selisihBoxClass = "bg-zinc-100 text-zinc-500";
    selisihNote =
      "Belum ada histori persediaan sebelum periode ini, jadi Persediaan Awal disamakan dengan Persediaan Akhir (COGS Aktual = Total Pembelian saja untuk sementara). Akurasi akan membaik setelah beberapa hari histori snapshot terkumpul.";
  } else if (cogsTeori === 0) {
    selisihBoxClass = "bg-zinc-100 text-zinc-500";
    selisihNote = "Belum ada penjualan dengan resep HPP di periode ini — COGS Teori belum bisa dibandingkan.";
  } else if (Math.abs(selisihPct) <= 10) {
    selisihBoxClass = "bg-brand-50 text-brand-700";
    selisihNote = "Selisih wajar (≤10%) — pemakaian bahan baku aktual cukup sejalan dengan teori resep.";
  } else if (selisih > 0) {
    selisihBoxClass = "bg-red-50 text-red-600";
    selisihNote =
      "Konsumsi bahan baku aktual lebih besar dari teori resep — indikasi waste, porsi kelebihan takaran, atau bahan terpakai di luar resep tercatat.";
  } else {
    selisihBoxClass = "bg-amber-50 text-amber-700";
    selisihNote =
      "Konsumsi bahan baku aktual lebih kecil dari teori resep — kemungkinan ada efisiensi, atau resep belum mencerminkan pemakaian bahan yang sesungguhnya.";
  }

  const { data: existingOpeningSnapshot } = await supabase
    .from("inventory_snapshots")
    .select("value")
    .eq("business_id", businessId)
    .eq("date", anchorDate)
    .eq("manual", true)
    .maybeSingle();

  return (
    <div className="w-full max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Keuangan — {business.name}</h1>
            <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
          </div>
          <PeriodTabs basePath={`/business/${businessId}/finance`} period={period} />
        </div>

        {period === "custom" && (
          <form
            method="get"
            className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4"
          >
            <input type="hidden" name="period" value="custom" />
            <label className="text-xs font-medium text-zinc-600">
              Dari
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-zinc-600">
              Sampai
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Terapkan
            </button>
          </form>
        )}

        {/* Ringkasan */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white shadow-sm p-4">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Total Pendapatan</p>
            <p className="text-lg font-bold text-zinc-900">{formatRupiah(revenue)}</p>
          </div>
          <div className="rounded-xl bg-white shadow-sm p-4">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Beban Operasional</p>
            <p className="text-lg font-bold text-zinc-900">{formatRupiah(totalOtherExp)}</p>
            <p className="mt-0.5 text-[10px] text-zinc-400">di luar bahan baku</p>
          </div>
          <div className="col-span-2 rounded-2xl bg-brand-700 p-4">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-brand-200">Laba Bersih</p>
            <p className="text-lg font-bold text-white">{formatRupiah(netProfit)}</p>
            <p className="mt-0.5 text-[10px] text-brand-200">pendapatan − COGS aktual − beban</p>
          </div>
        </div>

        {/* Rekonsiliasi */}
        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3.5">
            <h2 className="text-sm font-bold text-zinc-900">Rekonsiliasi Pembayaran &amp; Biaya Merchant</h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Sandingkan yang tercatat di POS vs yang benar-benar masuk ke rekening/saldo, setelah
              dipotong biaya merchant.
            </p>
          </div>

          {reconciliationRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold uppercase text-zinc-500">Metode</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase text-zinc-500">Total POS</th>
                    <th className="px-3 py-2 text-center font-semibold uppercase text-zinc-500">Fee</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase text-zinc-500">Biaya</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase text-zinc-500">Net</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase text-zinc-500">Aktual</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase text-zinc-500">Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationRows.map((r) => (
                    <tr key={r.method} className="border-t border-zinc-100">
                      <td className="px-3 py-2.5 font-medium text-zinc-900">
                        {r.method}
                        <span className="block text-[10px] font-normal text-zinc-400">
                          {r.count} transaksi
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-700">{formatRupiah(r.totalPOS)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <MerchantFeeInput businessId={businessId} method={r.method} feePercent={r.feePct} />
                      </td>
                      <td className="px-3 py-2.5 text-right text-red-500">
                        {r.merchantFee > 0 ? `−${formatRupiah(r.merchantFee)}` : formatRupiah(0)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-zinc-900">
                        {formatRupiah(r.estimasiNet)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-700">
                        {r.hasActual ? formatRupiah(r.actualReceived) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.hasActual ? (
                          <span
                            className={`font-semibold ${
                              Math.abs(r.selisih ?? 0) < 100
                                ? "text-brand-600"
                                : (r.selisih ?? 0) < 0
                                  ? "text-red-500"
                                  : "text-amber-600"
                            }`}
                          >
                            {(r.selisih ?? 0) > 0 ? "+" : ""}
                            {formatRupiah(r.selisih ?? 0)}
                          </span>
                        ) : (
                          <span className="text-zinc-300">belum dicatat</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-bold">
                    <td className="px-3 py-2.5 text-zinc-900">Total</td>
                    <td className="px-3 py-2.5 text-right text-zinc-900">
                      {formatRupiah(reconTotals.totalPOS)}
                    </td>
                    <td className="px-3 py-2.5"></td>
                    <td className="px-3 py-2.5 text-right text-red-500">
                      −{formatRupiah(reconTotals.merchantFee)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-900">
                      {formatRupiah(reconTotals.estimasiNet)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-900">
                      {formatRupiah(reconTotals.actualReceived)}
                    </td>
                    <td className="px-3 py-2.5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="px-4 py-10 text-center text-xs text-zinc-400">
              Belum ada transaksi di periode ini.
            </p>
          )}

          {openShift ? (
            <div className="border-t border-zinc-100 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-800">🔒 Rekonsiliasi terkunci selama shift masih berjalan</p>
              <p className="mt-1 text-[11px] text-amber-700/80">
                Tutup shift dulu supaya Total POS di tabel ini final, baru catat saldo diterima
                aktual. Ini berlaku tiap shift — bukan cuma shift pertama.
              </p>
            </div>
          ) : (
            <div className="border-t border-zinc-100 bg-zinc-50 p-4">
              <AddReconciliationForm action={boundAddReconciliation} methods={reconMethods} today={today} />
            </div>
          )}
        </div>

        {/* Kontrol HPP teori vs aktual */}
        <div className="mt-6 rounded-xl bg-white shadow-sm p-4">
          <h2 className="mb-1 text-sm font-bold text-zinc-900">Kontrol HPP — Teori vs Aktual</h2>
          <p className="mb-4 text-[11px] text-zinc-400">
            Teori dihitung dari HPP produk (resep untuk F&amp;B, atau harga modal langsung untuk
            retail) × qty terjual. Aktual dihitung dari nilai persediaan: Persediaan Awal +
            Pembelian − Persediaan Akhir. Untuk breakdown COGS teori per produk/kategori, lihat{" "}
            <Link href={`/business/${businessId}/reports/cogs`} className="text-brand-600 hover:underline">
              Laporan COGS
            </Link>
            .
          </p>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="mb-1 text-[10.5px] text-zinc-500">COGS Teori (resep)</p>
              <p className="text-base font-bold text-zinc-900">{formatRupiah(cogsTeori)}</p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="mb-1 text-[10.5px] text-zinc-500">COGS Aktual (persediaan)</p>
              <p className="text-base font-bold text-zinc-900">{formatRupiah(cogsAktual)}</p>
            </div>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-zinc-400">Persediaan Awal</p>
              <p className="text-xs font-semibold text-zinc-700">{formatRupiah(openingValue)}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-400">+ Pembelian</p>
              <p className="text-xs font-semibold text-zinc-700">{formatRupiah(totalPembelian)}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-400">− Persediaan Akhir</p>
              <p className="text-xs font-semibold text-zinc-700">{formatRupiah(closingValue)}</p>
            </div>
          </div>
          <div className={`flex items-center justify-between rounded-xl p-3 ${selisihBoxClass}`}>
            <span className="text-xs font-semibold">Selisih</span>
            <span className="text-sm font-bold">
              {selisih > 0 ? "+" : ""}
              {formatRupiah(selisih)} ({selisih > 0 ? "+" : ""}
              {selisihPct}%)
            </span>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-400">{selisihNote}</p>

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <h3 className="mb-1 text-xs font-bold text-amber-900">📐 Set Persediaan Awal Bulan Ini</h3>
            <p className="mb-2.5 text-[10.5px] leading-relaxed text-amber-800/80">
              Kalau kamu tahu nilai persediaan riil di awal bulan ini (dari hitung fisik/catatan
              lama, gabungan bahan baku + barang dagang), masukkan di sini supaya HPP Aktual
              langsung akurat.
            </p>
            <SetOpeningInventoryForm action={boundSetOpeningInventory} />
            {existingOpeningSnapshot && (
              <p className="mt-2 text-[10.5px] text-amber-700">
                Nilai tersimpan saat ini: {formatRupiah(Number(existingOpeningSnapshot.value))}
              </p>
            )}
          </div>
        </div>

        {/* Tambah pengeluaran */}
        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Catat Pengeluaran</h2>
          <AddExpenseForm
            action={boundAddExpense}
            today={today}
            isFnb={isFnb}
            ingredients={(ingredientsForCost ?? []).map((i) => ({
              id: i.id,
              name: i.name,
              unit: i.unit,
              stock: Number(i.stock),
            }))}
            products={(productsForCost ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              stock: Number(p.stock),
            }))}
          />
        </div>

        {/* Riwayat pengeluaran */}
        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
            <h2 className="text-sm font-bold text-zinc-900">Riwayat Pengeluaran</h2>
            <span className="text-[10.5px] font-semibold uppercase text-zinc-400">
              {expenses?.length ?? 0} tercatat
            </span>
          </div>
          {expenses && expenses.length > 0 ? (
            <div className="divide-y divide-zinc-100">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      e.category === PURCHASE_INGREDIENT_CATEGORY
                        ? "bg-amber-50"
                        : e.category === PURCHASE_PRODUCT_CATEGORY
                          ? "bg-blue-50"
                          : "bg-zinc-50"
                    }`}
                  >
                    <span className="text-base">
                      {e.category === PURCHASE_INGREDIENT_CATEGORY
                        ? "🧂"
                        : e.category === PURCHASE_PRODUCT_CATEGORY
                          ? "📦"
                          : "💸"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">
                      {e.category}
                      {e.qty ? ` · ${e.qty}` : ""}
                    </p>
                    <p className="truncate text-[11px] text-zinc-400">
                      {formatDate(e.date)}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-zinc-900">
                    {formatRupiah(Number(e.amount))}
                  </span>
                  <DeleteExpenseButton businessId={businessId} expenseId={e.id} />
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-14 text-center text-xs text-zinc-400">
              Belum ada pengeluaran tercatat
            </p>
          )}
        </div>
    </div>
  );
}
