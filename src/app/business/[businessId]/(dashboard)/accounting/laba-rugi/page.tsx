import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_DESCRIPTIONS,
  PERIOD_LABELS,
  getPeriodRange,
  parsePeriod,
  type Period,
} from "../../reports/period";

const HPP_ACCOUNT_CODE = "5-001";

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

export default async function LabaRugiAkrualPage({
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

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code, name, type, normal_balance")
    .eq("business_id", businessId)
    .in("type", ["pendapatan", "beban"]);

  let entryQuery = supabase
    .from("journal_entries")
    .select("journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId);
  if (fromIso) entryQuery = entryQuery.gte("date", fromIso);
  if (toIsoExclusive) entryQuery = entryQuery.lt("date", toIsoExclusive);
  const { data: entries } = await entryQuery;

  const balanceByAccount = new Map<string, number>();
  for (const entry of entries ?? []) {
    const lines = entry.journal_lines as unknown as {
      debit: number;
      credit: number;
      account_id: string;
    }[];
    for (const l of lines) {
      const cur = balanceByAccount.get(l.account_id) ?? 0;
      balanceByAccount.set(l.account_id, cur + Number(l.debit) - Number(l.credit));
    }
  }

  function balanceOf(a: { id: string; normal_balance: string }) {
    const raw = balanceByAccount.get(a.id) ?? 0;
    return a.normal_balance === "debit" ? raw : -raw;
  }

  const pendapatanRows = (accounts ?? [])
    .filter((a) => a.type === "pendapatan")
    .map((a) => ({ ...a, balance: balanceOf(a) }))
    .filter((a) => a.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  const bebanRows = (accounts ?? [])
    .filter((a) => a.type === "beban")
    .map((a) => ({ ...a, balance: balanceOf(a), isCogs: a.code === HPP_ACCOUNT_CODE }))
    .filter((a) => a.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  const totalPendapatan = pendapatanRows.reduce((s, r) => s + r.balance, 0);
  const cogsTotal = bebanRows.filter((r) => r.isCogs).reduce((s, r) => s + r.balance, 0);
  const operasionalRows = bebanRows.filter((r) => !r.isCogs);
  const operasionalTotal = operasionalRows.reduce((s, r) => s + r.balance, 0);
  const labaKotor = totalPendapatan - cogsTotal;
  const labaBersih = labaKotor - operasionalTotal;
  const margin = totalPendapatan > 0 ? Math.round((labaBersih / totalPendapatan) * 100) : null;
  const maxOperasional = operasionalRows[0]?.balance ?? 1;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Laba Rugi (Akrual) — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["today", "week", "month", "all", "custom"] as Period[]).map((p) => (
            <Link
              key={p}
              href={`/business/${businessId}/accounting/laba-rugi?period=${p}`}
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

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="space-y-3 p-5">
          <p className="text-xs font-semibold uppercase text-zinc-400">Pendapatan</p>
          {pendapatanRows.length > 0 ? (
            pendapatanRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between">
                <span className="text-sm text-zinc-600">{r.name}</span>
                <span className="text-sm font-semibold text-zinc-900">{formatRupiah(r.balance)}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-zinc-300">Belum ada pendapatan di periode ini.</p>
          )}
          <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
            <span className="text-sm text-zinc-600">− Beban Pokok Penjualan (HPP)</span>
            <span className="text-sm font-semibold text-red-500">
              {cogsTotal > 0 ? `−${formatRupiah(cogsTotal)}` : formatRupiah(0)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
            <span className="text-sm font-semibold text-zinc-900">Laba Kotor</span>
            <span className="text-base font-bold text-zinc-900">{formatRupiah(labaKotor)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">− Beban Operasional</span>
            <span className="text-sm font-semibold text-red-500">
              {operasionalTotal > 0 ? `−${formatRupiah(operasionalTotal)}` : formatRupiah(0)}
            </span>
          </div>
        </div>
        <div
          className={`flex items-center justify-between p-5 ${
            labaBersih >= 0 ? "bg-brand-700" : "bg-red-600"
          }`}
        >
          <div>
            <p className="text-[10.5px] font-semibold uppercase text-white/70">
              {labaBersih >= 0 ? "Laba Bersih" : "Rugi Bersih"}
            </p>
            <p className="text-2xl font-bold text-white">{formatRupiah(labaBersih)}</p>
          </div>
          {margin !== null && (
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
              margin {margin}%
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Rincian Beban Operasional</h2>
        </div>
        {operasionalRows.length > 0 ? (
          <div className="space-y-3 p-4">
            {operasionalRows.map((r) => (
              <div key={r.id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-700">{r.name}</span>
                  <span className="text-xs font-bold text-zinc-600">
                    {formatRupiah(r.balance)}
                    <span className="ml-1.5 font-normal text-zinc-400">
                      ({operasionalTotal > 0 ? Math.round((r.balance / operasionalTotal) * 100) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-100">
                  <div
                    className="h-2 rounded-full bg-brand-500"
                    style={{ width: `${Math.round((r.balance / maxOperasional) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm font-bold text-zinc-900">
              <span>Total Beban Operasional</span>
              <span>{formatRupiah(operasionalTotal)}</span>
            </div>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-xs text-zinc-400">
            Belum ada beban operasional di periode ini.
          </p>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Ditarik dari Jurnal (akrual) — pendapatan tercatat saat transaksi terjadi, termasuk
        penjualan piutang yang belum dibayar. Beda dengan{" "}
        <Link href={`/business/${businessId}/reports/laba-rugi`} className="text-brand-600 hover:underline">
          Laba Rugi
        </Link>{" "}
        (berbasis kas) yang cuma menghitung transaksi POS, laporan ini juga mengikutkan piutang,
        pembelian utang, dan jurnal manual lainnya.
      </p>
    </div>
  );
}
