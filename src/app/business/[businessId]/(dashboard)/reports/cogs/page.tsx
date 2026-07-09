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

const LOW_MARGIN_THRESHOLD = 20;

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

type Row = {
  key: string;
  label: string;
  qty: number;
  revenue: number;
  cogs: number;
  hasCost: boolean;
};

function marginOf(row: Row) {
  return row.revenue - row.cogs;
}

function marginPctOf(row: Row) {
  return row.revenue > 0 ? Math.round((marginOf(row) / row.revenue) * 100) : null;
}

export default async function CogsReportPage({
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
    .select("voided, transaction_items(product_id, name, category, price, cost, qty)")
    .eq("business_id", businessId);
  if (fromIso) txQuery = txQuery.gte("date", fromIso);
  if (toIsoExclusive) txQuery = txQuery.lt("date", toIsoExclusive);
  const { data: transactions } = await txQuery;

  const validTx = (transactions ?? []).filter((t) => !t.voided);

  const byProduct = new Map<string, Row>();
  const byCategory = new Map<string, Row>();

  for (const t of validTx) {
    for (const i of t.transaction_items) {
      const qty = Number(i.qty);
      const revenue = Number(i.price) * qty;
      const cogs = Number(i.cost) * qty;
      const hasCost = Number(i.cost) > 0;

      const pKey = i.product_id ?? i.name;
      const p = byProduct.get(pKey) ?? {
        key: pKey,
        label: i.name,
        qty: 0,
        revenue: 0,
        cogs: 0,
        hasCost: false,
      };
      p.qty += qty;
      p.revenue += revenue;
      p.cogs += cogs;
      p.hasCost = p.hasCost || hasCost;
      byProduct.set(pKey, p);

      const cKey = i.category ?? "Lainnya";
      const c = byCategory.get(cKey) ?? {
        key: cKey,
        label: cKey,
        qty: 0,
        revenue: 0,
        cogs: 0,
        hasCost: false,
      };
      c.qty += qty;
      c.revenue += revenue;
      c.cogs += cogs;
      c.hasCost = c.hasCost || hasCost;
      byCategory.set(cKey, c);
    }
  }

  const productRows = Array.from(byProduct.values()).sort((a, b) => b.cogs - a.cogs);
  const categoryRows = Array.from(byCategory.values()).sort((a, b) => b.cogs - a.cogs);

  const totalRevenue = productRows.reduce((s, r) => s + r.revenue, 0);
  const totalCogs = productRows.reduce((s, r) => s + r.cogs, 0);
  const totalMargin = totalRevenue - totalCogs;
  const totalMarginPct = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : null;

  const noCostProducts = productRows.filter((r) => !r.hasCost && r.revenue > 0);
  const lowMarginProducts = productRows.filter((r) => {
    const pct = marginPctOf(r);
    return r.hasCost && pct !== null && pct < LOW_MARGIN_THRESHOLD;
  });

  const periodQuery =
    period === "custom"
      ? `period=custom${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
      : `period=${period}`;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Laporan COGS — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["today", "week", "month", "all", "custom"] as Period[]).map((p) => (
            <Link
              key={p}
              href={`/business/${businessId}/reports/cogs?period=${p}`}
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

      {/* KPI utama */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
            Total Pendapatan
          </p>
          <p className="text-xl font-bold text-zinc-900">{formatRupiah(totalRevenue)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
            Total COGS (Teori)
          </p>
          <p className="text-xl font-bold text-zinc-900">{formatRupiah(totalCogs)}</p>
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-brand-700">
            Margin Kotor
          </p>
          <p className="text-xl font-bold text-brand-700">{formatRupiah(totalMargin)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
            Margin Rata-rata
          </p>
          <p className="text-xl font-bold text-zinc-900">
            {totalMarginPct === null ? "—" : `${totalMarginPct}%`}
          </p>
        </div>
      </div>

      {(noCostProducts.length > 0 || lowMarginProducts.length > 0) && (
        <div className="mt-4 space-y-2">
          {noCostProducts.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
              <b>{noCostProducts.length} produk</b> terjual tanpa data HPP (harga modal 0) — margin
              tidak bisa dihitung akurat. Isi resep atau harga modal di halaman Kelola Produk.
            </div>
          )}
          {lowMarginProducts.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <b>{lowMarginProducts.length} produk</b> punya margin di bawah {LOW_MARGIN_THRESHOLD}%
              — pertimbangkan naikkan harga jual atau tinjau ulang resepnya.
            </div>
          )}
        </div>
      )}

      {/* Per kategori */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">COGS per Kategori</h2>
        </div>
        {categoryRows.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {categoryRows.map((r) => {
              const margin = marginOf(r);
              const pct = marginPctOf(r);
              return (
                <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">{r.label}</p>
                    <p className="text-[11px] text-zinc-400">
                      {r.qty}x · Pendapatan {formatRupiah(r.revenue)} · COGS {formatRupiah(r.cogs)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-zinc-900">{formatRupiah(margin)}</p>
                    <p
                      className={`text-[11px] font-medium ${
                        pct !== null && pct < LOW_MARGIN_THRESHOLD ? "text-red-500" : "text-zinc-400"
                      }`}
                    >
                      {pct === null ? "—" : `${pct}% margin`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada data</p>
        )}
      </div>

      {/* Per produk */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">COGS per Produk</h2>
          <span className="text-[10.5px] font-semibold uppercase text-zinc-400">
            urut kontribusi COGS
          </span>
        </div>
        {productRows.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {productRows.map((r) => {
              const margin = marginOf(r);
              const pct = marginPctOf(r);
              const flagged = !r.hasCost || (pct !== null && pct < LOW_MARGIN_THRESHOLD);
              return (
                <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">{r.label}</p>
                      {!r.hasCost && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          Belum ada HPP
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {r.qty}x · Pendapatan {formatRupiah(r.revenue)} · COGS {formatRupiah(r.cogs)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${flagged ? "text-red-500" : "text-zinc-900"}`}>
                      {formatRupiah(margin)}
                    </p>
                    <p
                      className={`text-[11px] font-medium ${
                        pct !== null && pct < LOW_MARGIN_THRESHOLD ? "text-red-500" : "text-zinc-400"
                      }`}
                    >
                      {pct === null ? "—" : `${pct}% margin`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada data</p>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        COGS di sini dihitung teori (HPP produk × qty terjual). Untuk perbandingan dengan
        pemakaian bahan baku aktual, lihat{" "}
        <Link href={`/business/${businessId}/finance?${periodQuery}`} className="text-brand-600 hover:underline">
          Keuangan
        </Link>
        .
      </p>
    </div>
  );
}
