import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_DESCRIPTIONS,
  PERIOD_LABELS,
  getPeriodRange,
  parsePeriod,
  type Period,
} from "../period";

const PURCHASE_CATEGORIES = new Set(["Pembelian Bahan Baku", "Pembelian Barang Dagang"]);

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

export default async function LabaRugiPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam, from, to } = await searchParams;
  const period = parsePeriod(periodParam);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  let txQuery = supabase
    .from("transactions")
    .select("total")
    .eq("business_id", businessId)
    .eq("voided", false);
  if (fromIso) txQuery = txQuery.gte("date", fromIso);
  if (toIsoExclusive) txQuery = txQuery.lt("date", toIsoExclusive);
  const { data: transactions } = await txQuery;

  const revenue = (transactions ?? []).reduce((s, t) => s + Number(t.total), 0);

  // expenses.date is a plain date column; timestamptz bounds are trimmed to
  // their date part so both queries stay aligned to the same WIB period.
  let expQuery = supabase
    .from("expenses")
    .select("category, amount")
    .eq("business_id", businessId);
  if (fromIso) expQuery = expQuery.gte("date", fromIso.slice(0, 10));
  if (toIsoExclusive) expQuery = expQuery.lt("date", toIsoExclusive.slice(0, 10));
  const { data: expenses } = await expQuery;

  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));
  }
  const categoryRows = Array.from(byCategory.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      isCogs: PURCHASE_CATEGORIES.has(category),
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalExpenses = categoryRows.reduce((s, r) => s + r.amount, 0);
  const cogsTotal = categoryRows.filter((r) => r.isCogs).reduce((s, r) => s + r.amount, 0);
  const operationalTotal = totalExpenses - cogsTotal;
  const netProfit = revenue - totalExpenses;
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : null;
  const maxAmount = categoryRows[0]?.amount ?? 1;

  const periodQuery =
    period === "custom"
      ? `period=custom${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
      : `period=${period}`;

  return (
    <div className="w-full max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Laba Rugi — {business.name}</h1>
            <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["today", "week", "month", "all", "custom"] as Period[]).map((p) => (
              <Link
                key={p}
                href={`/business/${businessId}/reports/laba-rugi?period=${p}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  p === period
                    ? "bg-brand-600 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {PERIOD_LABELS[p]}
              </Link>
            ))}
          </div>
        </div>

        {period === "custom" && (
          <form
            method="get"
            className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
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

        {/* Ringkasan laba rugi */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Pendapatan</span>
              <span className="text-base font-bold text-zinc-900">{formatRupiah(revenue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">− Pembelian (HPP)</span>
              <span className="text-sm font-semibold text-red-500">
                {cogsTotal > 0 ? `−${formatRupiah(cogsTotal)}` : formatRupiah(0)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
              <span className="text-sm font-semibold text-zinc-900">Laba Kotor</span>
              <span className="text-base font-bold text-zinc-900">
                {formatRupiah(revenue - cogsTotal)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">− Beban Operasional</span>
              <span className="text-sm font-semibold text-red-500">
                {operationalTotal > 0 ? `−${formatRupiah(operationalTotal)}` : formatRupiah(0)}
              </span>
            </div>
          </div>
          <div
            className={`flex items-center justify-between p-5 ${
              netProfit >= 0 ? "bg-brand-700" : "bg-red-600"
            }`}
          >
            <div>
              <p className="text-[10.5px] font-semibold uppercase text-white/70">
                {netProfit >= 0 ? "Laba Bersih" : "Rugi Bersih"}
              </p>
              <p className="text-2xl font-bold text-white">{formatRupiah(netProfit)}</p>
            </div>
            {margin !== null && (
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                margin {margin}%
              </span>
            )}
          </div>
        </div>

        {/* Rincian pengeluaran per kategori */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3.5">
            <h2 className="text-sm font-bold text-zinc-900">Rincian Pengeluaran per Kategori</h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Termasuk pembelian bahan baku/barang dagang (HPP) dan beban operasional.
            </p>
          </div>
          {categoryRows.length > 0 ? (
            <div className="space-y-3 p-4">
              {categoryRows.map((r) => (
                <div key={r.category}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-700">
                      {r.category}
                      {r.isCogs && (
                        <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700">
                          HPP
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-bold text-zinc-600">
                      {formatRupiah(r.amount)}
                      <span className="ml-1.5 font-normal text-zinc-400">
                        ({totalExpenses > 0 ? Math.round((r.amount / totalExpenses) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-100">
                    <div
                      className={`h-2 rounded-full ${r.isCogs ? "bg-amber-400" : "bg-brand-500"}`}
                      style={{ width: `${Math.round((r.amount / maxAmount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm font-bold text-zinc-900">
                <span>Total Pengeluaran</span>
                <span>{formatRupiah(totalExpenses)}</span>
              </div>
            </div>
          ) : (
            <p className="px-4 py-10 text-center text-xs text-zinc-400">
              Belum ada pengeluaran tercatat di periode ini.
            </p>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] text-zinc-400">
          Analisa ini berbasis kas (pendapatan transaksi vs total pengeluaran tercatat). Untuk
          perbandingan HPP teori resep vs pemakaian stok aktual, lihat{" "}
          <Link href={`/business/${businessId}/finance?${periodQuery}`} className="text-brand-600 hover:underline">
            Keuangan
          </Link>
          . Untuk versi akrual (termasuk piutang belum dibayar), lihat{" "}
          <Link href={`/business/${businessId}/accounting/laba-rugi`} className="text-brand-600 hover:underline">
            Laba Rugi (Akrual)
          </Link>
          .
        </p>
    </div>
  );
}
