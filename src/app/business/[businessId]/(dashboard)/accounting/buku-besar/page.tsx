import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Wallet, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { StatCard } from "@/components/ui/stat-card";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  getPeriodRange,
  parsePeriod,
} from "../../reports/period";
import PeriodTabs from "../../reports/period-tabs";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  penjualan: "Penjualan",
  void: "Void",
  pembelian: "Pembelian",
  beban: "Beban",
  payroll: "Payroll",
  tutup_buku: "Tutup Buku",
  koreksi: "Koreksi",
  shift: "Shift",
  kas_kecil: "Kas Kecil",
};

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default async function BukuBesarPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ account?: string; period?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { account: accountParam, period: periodParam, from, to } = await searchParams;
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
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
    .order("code", { ascending: true });

  if (!accounts || accounts.length === 0) {
    notFound();
  }

  const selectedAccount = accounts.find((a) => a.id === accountParam) ?? accounts[0];
  const isDebitNormal = selectedAccount.normal_balance === "debit";

  // Saldo awal: mutasi akun ini sebelum tanggal "Dari" -- kalau periode
  // "Semua Waktu" (fromIso null) tidak ada saldo awal, seluruh riwayat masuk
  // ke mutasi periode. Difilter server-side ke akun ini saja
  // (journal_lines!inner) dan dibungkus fetchAllRows karena Supabase/PostgREST
  // diam-diam memotong hasil di 1000 baris kalau tidak di-paginate (lihat
  // lib/pagination.ts).
  const [openingEntries, periodEntries] = await Promise.all([
    fromIso
      ? fetchAllRows<{ journal_lines: { debit: number; credit: number }[] }>((rangeFrom, rangeTo) =>
          supabase
            .from("journal_entries")
            .select("journal_lines!inner(debit, credit)")
            .eq("business_id", businessId)
            .eq("journal_lines.account_id", selectedAccount.id)
            .lt("date", fromIso)
            .range(rangeFrom, rangeTo),
        )
      : Promise.resolve([]),
    fetchAllRows<{
      id: string;
      date: string;
      description: string;
      source: string;
      journal_lines: { debit: number; credit: number }[];
    }>((rangeFrom, rangeTo) => {
      let q = supabase
        .from("journal_entries")
        .select("id, date, description, source, journal_lines!inner(debit, credit)")
        .eq("business_id", businessId)
        .eq("journal_lines.account_id", selectedAccount.id)
        .order("date", { ascending: true })
        .range(rangeFrom, rangeTo);
      if (fromIso) q = q.gte("date", fromIso);
      if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
      return q;
    }),
  ]);

  let openingRaw = 0;
  for (const e of openingEntries) {
    for (const l of e.journal_lines) {
      openingRaw += Number(l.debit) - Number(l.credit);
    }
  }
  const openingBalance = isDebitNormal ? openingRaw : -openingRaw;

  let runningRaw = openingRaw;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: {
    id: string;
    date: string;
    description: string;
    source: string;
    debit: number;
    credit: number;
    balance: number;
  }[] = [];
  for (const e of periodEntries) {
    for (const l of e.journal_lines) {
      const debit = Number(l.debit);
      const credit = Number(l.credit);
      totalDebit += debit;
      totalCredit += credit;
      runningRaw += debit - credit;
      rows.push({
        id: e.id,
        date: e.date,
        description: e.description,
        source: e.source,
        debit,
        credit,
        balance: isDebitNormal ? runningRaw : -runningRaw,
      });
    }
  }
  const closingBalance = isDebitNormal ? runningRaw : -runningRaw;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Buku Besar — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {selectedAccount.code} — {selectedAccount.name} · {PERIOD_DESCRIPTIONS[period]}
          </p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/accounting/buku-besar`} period={period} />
      </div>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <input type="hidden" name="period" value={period} />
        {period === "custom" && (
          <>
            <input type="hidden" name="from" value={from ?? ""} />
            <input type="hidden" name="to" value={to ?? ""} />
          </>
        )}
        <label className="text-xs font-medium text-zinc-600">
          Akun
          <select
            name="account"
            defaultValue={selectedAccount.id}
            className="mt-1 block rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Tampilkan
        </button>
      </form>

      {period === "custom" && (
        <form
          method="get"
          className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <input type="hidden" name="period" value="custom" />
          <input type="hidden" name="account" value={selectedAccount.id} />
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

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Saldo Awal" value={formatRupiah(openingBalance)} icon={Wallet} tone="zinc" />
        <StatCard label="Total Debit" value={formatRupiah(totalDebit)} icon={TrendingUp} tone="brand" />
        <StatCard label="Total Kredit" value={formatRupiah(totalCredit)} icon={TrendingDown} tone="red" />
        <StatCard label="Saldo Akhir" value={formatRupiah(closingBalance)} icon={Scale} tone="blue" />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-bold text-zinc-900">Mutasi {selectedAccount.name}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[10px] uppercase text-zinc-500">
                <th className="px-4 py-2">Tanggal</th>
                <th className="px-4 py-2">Keterangan</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Kredit</th>
                <th className="px-4 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <td className="px-4 py-2 text-zinc-400" colSpan={4}>
                  Saldo Awal{fromIso ? "" : " (sejak awal pencatatan)"}
                </td>
                <td className="px-4 py-2 text-right font-semibold text-zinc-700">
                  {formatRupiah(openingBalance)}
                </td>
              </tr>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-300">
                    Tidak ada mutasi di periode ini.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={`${r.id}-${i}`} className="border-b border-zinc-50 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-500">{formatDate(r.date)}</td>
                  <td className="px-4 py-2 text-zinc-700">
                    {r.description}
                    <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">
                      {SOURCE_LABELS[r.source] ?? r.source}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-700">{r.debit > 0 ? formatRupiah(r.debit) : "—"}</td>
                  <td className="px-4 py-2 text-right text-zinc-700">{r.credit > 0 ? formatRupiah(r.credit) : "—"}</td>
                  <td className="px-4 py-2 text-right font-semibold text-zinc-900">{formatRupiah(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-900">
          <span>Saldo Akhir</span>
          <span>{formatRupiah(closingBalance)}</span>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Mutasi akun ini ditarik dari Jurnal Transaksi, diurutkan kronologis dengan saldo berjalan —
        cocokkan dengan{" "}
        <a href={`/business/${businessId}/accounting/jurnal`} className="text-brand-600 hover:underline">
          Jurnal Transaksi
        </a>{" "}
        kalau perlu lihat detail sisi lawan setiap transaksi.
      </p>
    </div>
  );
}
