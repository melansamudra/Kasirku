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
    .select("id, code, name, type")
    .eq("business_id", businessId);

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));
  const kasAccountId = (accounts ?? []).find((a) => a.code === KAS_ACCOUNT_CODE)?.id;

  // Saldo kas sebelum periode ini (untuk saldo awal).
  let openingBalance = 0;
  if (kasAccountId && fromIso) {
    const { data: priorEntries } = await supabase
      .from("journal_entries")
      .select("journal_lines(debit, credit, account_id)")
      .eq("business_id", businessId)
      .lt("date", fromIso);
    for (const e of priorEntries ?? []) {
      const lines = e.journal_lines as unknown as { debit: number; credit: number; account_id: string }[];
      for (const l of lines) {
        if (l.account_id === kasAccountId) {
          openingBalance += Number(l.debit) - Number(l.credit);
        }
      }
    }
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
  const { data: entries } = await entryQuery;

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
        <div className="flex flex-wrap gap-1.5">
          {(["today", "week", "month", "all", "custom"] as Period[]).map((p) => (
            <Link
              key={p}
              href={`/business/${businessId}/accounting/arus-kas?period=${p}`}
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

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Kas Masuk</p>
          <p className="text-xl font-bold text-zinc-900">{formatRupiah(totalMasuk)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Kas Keluar</p>
          <p className="text-xl font-bold text-zinc-900">{formatRupiah(totalKeluar)}</p>
        </div>
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
        Dihitung dari akun "Kas &amp; Bank" di jurnal — belum memisahkan kas fisik vs saldo bank.
      </p>
    </div>
  );
}
