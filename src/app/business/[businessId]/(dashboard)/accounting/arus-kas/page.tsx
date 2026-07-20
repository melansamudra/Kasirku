import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  getPeriodRange,
  parsePeriod,
} from "../../reports/period";
import PeriodTabs from "../../reports/period-tabs";

const KAS_ACCOUNT_CODE = "1-001";
// Kode akun aset tetap — arus kas yang lawan-akunnya kode ini masuk "Investasi".
// Akun bertipe "modal" (setoran/penarikan modal, pinjaman) masuk "Pendanaan".
// Selain itu (pendapatan, beban, persediaan, utang dagang/gaji, piutang) masuk "Operasional".
const ASET_TETAP_CODES = new Set(["1-500"]);

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

export default async function ArusKasPage({
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

  // business & accounts tidak saling bergantung — paralel.
  const [{ data: business }, { data: accounts }] = await Promise.all([
    supabase.from("businesses").select("id, name").eq("id", businessId).single(),
    supabase.from("accounts").select("id, code, name, type").eq("business_id", businessId),
  ]);

  if (!business) {
    notFound();
  }

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));
  const kasAccountId = (accounts ?? []).find((a) => a.code === KAS_ACCOUNT_CODE)?.id;

  // Saldo kas sebelum periode ini (untuk saldo awal) — difilter ke baris
  // akun Kas & Bank saja di level query (`journal_lines!inner` + filter
  // account_id) supaya tidak menarik seluruh baris jurnal semua akun dari
  // awal pencatatan, cuma yang menyentuh akun Kas.
  let openingQuery = null;
  if (kasAccountId && fromIso) {
    openingQuery = supabase
      .from("journal_entries")
      .select("journal_lines!inner(debit, credit, account_id)")
      .eq("business_id", businessId)
      .eq("journal_lines.account_id", kasAccountId)
      .lt("date", fromIso);
  }

  // Arus kas di periode ini. Setiap entry jurnal yang punya baris Kas & Bank
  // diklasifikasikan Operasional/Investasi/Pendanaan berdasarkan akun
  // lawannya (bukan `journal_entries.source`, karena RPC manual-entry yang
  // dipakai pembelian & pengeluaran selalu menulis source='manual' — lihat
  // catatan di [[mini-erp-scope]] soal bug ini).
  let entryQuery = supabase
    .from("journal_entries")
    .select("description, journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId);
  if (fromIso) entryQuery = entryQuery.gte("date", fromIso);
  if (toIsoExclusive) entryQuery = entryQuery.lt("date", toIsoExclusive);

  // Saldo awal & arus kas periode ini tidak saling bergantung — paralel.
  const [openingResult, { data: entries }] = await Promise.all([
    openingQuery ?? Promise.resolve({ data: null as { journal_lines: { debit: number; credit: number; account_id: string }[] }[] | null }),
    entryQuery,
  ]);

  let openingBalance = 0;
  for (const e of openingResult.data ?? []) {
    const lines = e.journal_lines as unknown as { debit: number; credit: number; account_id: string }[];
    for (const l of lines) {
      openingBalance += Number(l.debit) - Number(l.credit);
    }
  }

  type Bucket = "operasional" | "investasi" | "pendanaan";
  const byLabel = new Map<Bucket, Map<string, { masuk: number; keluar: number }>>([
    ["operasional", new Map()],
    ["investasi", new Map()],
    ["pendanaan", new Map()],
  ]);

  for (const e of entries ?? []) {
    const lines = e.journal_lines as unknown as { debit: number; credit: number; account_id: string }[];
    const kasLines = lines.filter((l) => l.account_id === kasAccountId);
    if (kasLines.length === 0) continue;

    const counterpartAccounts = lines
      .filter((l) => l.account_id !== kasAccountId)
      .map((l) => accountMap.get(l.account_id))
      .filter((a): a is NonNullable<typeof a> => !!a);

    let bucket: Bucket = "operasional";
    if (counterpartAccounts.some((a) => a.type === "modal")) {
      bucket = "pendanaan";
    } else if (counterpartAccounts.some((a) => ASET_TETAP_CODES.has(a.code))) {
      bucket = "investasi";
    }

    const label =
      counterpartAccounts.length > 0
        ? Array.from(new Set(counterpartAccounts.map((a) => a.name))).join(" / ")
        : (e.description ?? "Lainnya");

    const group = byLabel.get(bucket)!;
    const cur = group.get(label) ?? { masuk: 0, keluar: 0 };
    for (const l of kasLines) {
      cur.masuk += Number(l.debit);
      cur.keluar += Number(l.credit);
    }
    group.set(label, cur);
  }

  function toRows(bucket: Bucket) {
    return Array.from(byLabel.get(bucket)!.entries())
      .map(([label, v]) => ({ label, ...v, net: v.masuk - v.keluar }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }

  const operasionalRows = toRows("operasional");
  const investasiRows = toRows("investasi");
  const pendanaanRows = toRows("pendanaan");
  const lainnyaRows = [...investasiRows, ...pendanaanRows];
  const rows = [...operasionalRows, ...lainnyaRows];

  const totalMasuk = rows.reduce((s, r) => s + r.masuk, 0);
  const totalKeluar = rows.reduce((s, r) => s + r.keluar, 0);
  const netCashFlow = totalMasuk - totalKeluar;
  const closingBalance = openingBalance + netCashFlow;

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Laporan Arus Kas — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/accounting/arus-kas`} period={period} />
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

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="Kas Masuk" value={formatRupiah(totalMasuk)} icon={TrendingUp} tone="brand" />
        <StatCard label="Kas Keluar" value={formatRupiah(totalKeluar)} icon={TrendingDown} tone="red" />
        <StatCard
          label="Saldo Kas Akhir"
          value={formatRupiah(closingBalance)}
          icon={Wallet}
          tone={closingBalance >= 0 ? "brand" : "red"}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-bold text-zinc-900">Aktivitas Operasional</h2>
        </div>
        <div className="divide-y divide-zinc-50 px-4">
          {operasionalRows.length > 0 ? (
            operasionalRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2 text-xs">
                <span className="text-zinc-600">{r.label}</span>
                <span className={`font-medium ${r.net >= 0 ? "text-zinc-800" : "text-red-500"}`}>
                  {r.net >= 0 ? "+" : ""}
                  {formatRupiah(r.net)}
                </span>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-xs text-zinc-300">Belum ada aktivitas</p>
          )}
        </div>
      </div>

      {lainnyaRows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-bold text-zinc-900">Investasi &amp; Pendanaan</h2>
          </div>
          <div className="divide-y divide-zinc-50 px-4">
            {lainnyaRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2 text-xs">
                <span className="text-zinc-600">{r.label}</span>
                <span className={`font-medium ${r.net >= 0 ? "text-zinc-800" : "text-red-500"}`}>
                  {r.net >= 0 ? "+" : ""}
                  {formatRupiah(r.net)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-200 bg-brand-50">
        <div className="divide-y divide-brand-100 px-4">
          <div className="flex items-center justify-between py-2.5 text-xs text-brand-700">
            <span>Saldo Kas Awal</span>
            <span className="font-semibold">{formatRupiah(openingBalance)}</span>
          </div>
          <div className="flex items-center justify-between py-2.5 text-xs text-brand-700">
            <span>Arus Kas Bersih Periode Ini</span>
            <span className="font-semibold">
              {netCashFlow >= 0 ? "+" : ""}
              {formatRupiah(netCashFlow)}
            </span>
          </div>
          <div className="flex items-center justify-between py-3 text-sm font-bold text-brand-700">
            <span>Saldo Kas Akhir</span>
            <span>{formatRupiah(closingBalance)}</span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Dihitung dari akun &quot;Kas &amp; Bank&quot; di jurnal — belum memisahkan kas fisik vs saldo bank.
      </p>
    </div>
  );
}
