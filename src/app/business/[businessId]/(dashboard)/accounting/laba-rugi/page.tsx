import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { TrendingUp, TrendingDown, Receipt, Wallet } from "lucide-react";
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

const HPP_ACCOUNT_CODE = "5-001";
const KAS_ACCOUNT_CODE = "1-001";

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

type Mode = "akrual" | "kas";

export default async function LabaRugiAkrualPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string; mode?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam, from, to, mode: modeParam } = await searchParams;
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);
  const mode: Mode = modeParam === "kas" ? "kas" : "akrual";

  const supabase = await createClient();

  // Ketiga query ini tidak saling bergantung — dijalankan paralel supaya
  // waktu tunggu halaman = query terlama, bukan jumlah semuanya. Query
  // journal_entries dibungkus fetchAllRows karena Supabase/PostgREST diam-diam
  // memotong hasil di 1000 baris kalau tidak di-paginate (lihat
  // lib/pagination.ts) -- kena terutama di periode "Semua Waktu".
  //
  // `accounts` narik SEMUA tipe (bukan cuma pendapatan/beban) karena mode
  // "Kas" (lihat di bawah) butuh akun Kas & Bank + tipe akun lawannya
  // (aset/kewajiban/modal) buat kategorisasi, sama seperti Arus Kas.
  const [{ data: business }, { data: accounts }, entries] = await Promise.all([
    supabase.from("businesses").select("id, name").eq("id", businessId).single(),
    supabase
      .from("accounts")
      .select("id, code, name, type, normal_balance")
      .eq("business_id", businessId),
    fetchAllRows<{ journal_lines: { debit: number; credit: number; account_id: string }[] }>(
      (from, to) => {
        let q = supabase
          .from("journal_entries")
          .select("journal_lines(debit, credit, account_id)")
          .eq("business_id", businessId)
          .range(from, to);
        if (fromIso) q = q.gte("date", fromIso);
        if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
        return q;
      },
    ),
  ]);

  if (!business) {
    notFound();
  }

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));

  const balanceByAccount = new Map<string, number>();
  for (const entry of entries) {
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

  // Mode "Kas" -- "Laba Rugi" versi kas masuk dikurangi SEMUA kas keluar
  // TANPA kecuali (termasuk pembelian bahan baku, bayar hutang, kasbon --
  // beda dari mode Akrual di atas yang HPP-nya cuma menghitung bahan yang
  // benar-benar kepakai buat produk terjual). Angkanya sengaja identik
  // dengan Laporan Arus Kas (lihat accounting/arus-kas/page.tsx) -- ini cuma
  // cara lain nampilkannya biar bisa dibandingkan langsung sama versi
  // Akrual di satu halaman yang sama (dari diskusi dengan user 2026-09-06:
  // bingung kenapa Laba Bersih akrual tidak mencerminkan uang yang beneran
  // keluar buat beli bahan baku).
  const kasAccountId = (accounts ?? []).find((a) => a.code === KAS_ACCOUNT_CODE)?.id;
  const kasCategoryTotals = new Map<string, { masuk: number; keluar: number }>();
  if (kasAccountId) {
    for (const entry of entries) {
      const lines = entry.journal_lines as unknown as { debit: number; credit: number; account_id: string }[];
      const kasLines = lines.filter((l) => l.account_id === kasAccountId);
      if (kasLines.length === 0) continue;

      const counterpartAccounts = lines
        .filter((l) => l.account_id !== kasAccountId)
        .map((l) => accountMap.get(l.account_id))
        .filter((a): a is NonNullable<ReturnType<typeof accountMap.get>> => !!a);

      const label =
        counterpartAccounts.length > 0
          ? Array.from(new Set(counterpartAccounts.map((a) => a.name))).join(" / ")
          : "Lainnya";

      const cur = kasCategoryTotals.get(label) ?? { masuk: 0, keluar: 0 };
      for (const l of kasLines) {
        cur.masuk += Number(l.debit);
        cur.keluar += Number(l.credit);
      }
      kasCategoryTotals.set(label, cur);
    }
  }
  const kasRows = Array.from(kasCategoryTotals.entries())
    .map(([label, v]) => ({ label, ...v, net: v.masuk - v.keluar }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const kasKeluarRows = kasRows.filter((r) => r.keluar > 0).sort((a, b) => b.keluar - a.keluar);
  const totalKasMasuk = kasRows.reduce((s, r) => s + r.masuk, 0);
  const totalKasKeluar = kasRows.reduce((s, r) => s + r.keluar, 0);
  const labaBersihKas = totalKasMasuk - totalKasKeluar;
  const marginKas = totalKasMasuk > 0 ? Math.round((labaBersihKas / totalKasMasuk) * 100) : null;
  const maxKasKeluar = kasKeluarRows[0]?.keluar ?? 1;

  const basePath = `/business/${businessId}/accounting/laba-rugi`;
  const periodQuery = `period=${period}${period === "custom" && from ? `&from=${from}` : ""}${period === "custom" && to ? `&to=${to}` : ""}`;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">
            Laba Rugi ({mode === "kas" ? "Kas" : "Akrual"}) — {business.name}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full bg-zinc-100 p-1">
            <Link
              href={`${basePath}?${periodQuery}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                mode === "akrual" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Akrual
            </Link>
            <Link
              href={`${basePath}?${periodQuery}&mode=kas`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                mode === "kas" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Kas
            </Link>
          </div>
          <PeriodTabs basePath={basePath} period={period} extraQuery={mode === "kas" ? "mode=kas" : undefined} />
        </div>
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

      {mode === "akrual" ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Pendapatan" value={formatRupiah(totalPendapatan)} icon={TrendingUp} tone="brand" />
            <StatCard
              label="Laba Kotor"
              value={formatRupiah(labaKotor)}
              sub={`HPP ${formatRupiah(cogsTotal)}`}
              icon={Receipt}
              tone="blue"
            />
            <StatCard
              label="Beban Operasional"
              value={formatRupiah(operasionalTotal)}
              icon={TrendingDown}
              tone="red"
            />
            <StatCard
              label={labaBersih >= 0 ? "Laba Bersih" : "Rugi Bersih"}
              value={formatRupiah(labaBersih)}
              sub={margin !== null ? `Margin ${margin}%` : undefined}
              icon={Wallet}
              tone={labaBersih >= 0 ? "brand" : "red"}
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
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

          <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
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
            penjualan piutang yang belum dibayar. Bahan baku dihitung sebagai beban (HPP) sebesar yang
            benar-benar KEPAKAI untuk produk yang terjual, bukan yang dibeli. Mau lihat versi kas
            aktual (semua uang keluar dihitung apa adanya, termasuk bahan baku yang dibeli)? Ketuk
            tombol &quot;Kas&quot; di atas.
          </p>
        </>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Kas Masuk" value={formatRupiah(totalKasMasuk)} icon={TrendingUp} tone="brand" />
            <StatCard label="Kas Keluar" value={formatRupiah(totalKasKeluar)} icon={TrendingDown} tone="red" />
            <StatCard
              label={labaBersihKas >= 0 ? "Laba Bersih (Kas)" : "Rugi (Kas)"}
              value={formatRupiah(labaBersihKas)}
              sub={marginKas !== null ? `Margin ${marginKas}%` : undefined}
              icon={Wallet}
              tone={labaBersihKas >= 0 ? "brand" : "red"}
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-900">Kas Masuk</span>
                <span className="text-sm font-semibold text-zinc-900">{formatRupiah(totalKasMasuk)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                <span className="text-sm text-zinc-600">− Kas Keluar (semua, tanpa kecuali)</span>
                <span className="text-sm font-semibold text-red-500">
                  {totalKasKeluar > 0 ? `−${formatRupiah(totalKasKeluar)}` : formatRupiah(0)}
                </span>
              </div>
            </div>
            <div
              className={`flex items-center justify-between p-5 ${
                labaBersihKas >= 0 ? "bg-brand-700" : "bg-red-600"
              }`}
            >
              <div>
                <p className="text-[10.5px] font-semibold uppercase text-white/70">
                  {labaBersihKas >= 0 ? "Laba Bersih (Kas)" : "Rugi (Kas)"}
                </p>
                <p className="text-2xl font-bold text-white">{formatRupiah(labaBersihKas)}</p>
              </div>
              {marginKas !== null && (
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                  margin {marginKas}%
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-4 py-3.5">
              <h2 className="text-sm font-bold text-zinc-900">Rincian Kas Keluar per Kategori</h2>
            </div>
            {kasKeluarRows.length > 0 ? (
              <div className="space-y-3 p-4">
                {kasKeluarRows.map((r) => (
                  <div key={r.label}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-700">{r.label}</span>
                      <span className="text-xs font-bold text-zinc-600">
                        {formatRupiah(r.keluar)}
                        <span className="ml-1.5 font-normal text-zinc-400">
                          ({totalKasKeluar > 0 ? Math.round((r.keluar / totalKasKeluar) * 100) : 0}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-100">
                      <div
                        className="h-2 rounded-full bg-red-400"
                        style={{ width: `${Math.round((r.keluar / maxKasKeluar) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm font-bold text-zinc-900">
                  <span>Total Kas Keluar</span>
                  <span>{formatRupiah(totalKasKeluar)}</span>
                </div>
              </div>
            ) : (
              <p className="px-4 py-10 text-center text-xs text-zinc-400">
                Belum ada kas keluar di periode ini.
              </p>
            )}
          </div>

          <p className="mt-3 text-center text-[11px] text-zinc-400">
            Versi kas — kas masuk dikurangi SEMUA kas keluar tanpa kecuali (termasuk pembelian bahan
            baku/barang, bayar hutang dagang, kasbon), persis seperti{" "}
            <Link href={`/business/${businessId}/accounting/arus-kas`} className="text-brand-600 hover:underline">
              Laporan Arus Kas
            </Link>
            . Bukan gambaran untung-rugi jualan yang sebenarnya (bahan baku yang belum kepakai ikut
            kehitung sebagai &quot;pengeluaran&quot; di sini) — untuk itu lihat mode &quot;Akrual&quot; di
            atas.
          </p>
        </>
      )}
    </div>
  );
}
