import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { fetchKasBankLines } from "@/lib/kas-bank";
import { PERIOD_COOKIE_NAME, PERIOD_DESCRIPTIONS, getPeriodRange, parsePeriod } from "../period";
import PeriodTabs from "../period-tabs";
import PrintHarianButton from "./print-harian-button";

function fmt(v: number) {
  const sign = v < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(v)).toLocaleString("id-ID")}`;
}
function toDateWib(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ businessId: string }>;
}): Promise<Metadata> {
  const { businessId } = await params;
  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).maybeSingle();
  return { title: business ? `Laporan Harian - ${business.name}` : "Laporan Harian" };
}

type DayData = {
  count: number;
  diskon: number;
  service: number;
  tax: number;
  pendapatanPenjualan: number;
  pendapatanGofood: number;
  pendapatanGrabfood: number;
  pendapatanLain: number;
  pengeluaranTunai: number;
  pengeluaranTransfer: number;
  hutangDibayar: number;
};

function emptyDay(): DayData {
  return {
    count: 0,
    diskon: 0,
    service: 0,
    tax: 0,
    pendapatanPenjualan: 0,
    pendapatanGofood: 0,
    pendapatanGrabfood: 0,
    pendapatanLain: 0,
    pengeluaranTunai: 0,
    pengeluaranTransfer: 0,
    hutangDibayar: 0,
  };
}

// Kode akun pendapatan non-penjualan yang direct dari "Catat Kas Masuk" di
// Kas & Bank -- Gofood/Grabfood dipisah biar kelihatan kontribusi tiap
// platform ojol, 4-999 tetap jadi tampungan pendapatan lain di luar itu.
const OJOL_ACCOUNT_CODES = ["4-003", "4-004", "4-999"] as const;

export default async function ReportsHarianPage({
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
  const { data: business } = await supabase.from("businesses").select("id, name").eq("id", businessId).maybeSingle();
  if (!business) notFound();

  // Batas atas buat query purchases/purchase_payments (kolom `date`, bukan
  // timestamptz) -- dari toIsoExclusive (WIB) diambil tanggal kalendernya.
  // "Semua Waktu" (toIsoExclusive null) berarti tidak ada batas atas.
  const purchasesUpperBound = toIsoExclusive
    ? new Date(new Date(toIsoExclusive).getTime() - 1).toISOString().slice(0, 10)
    : null;

  const [txRows, { data: ojolAccounts }, kasBank, { data: allPurchases }, { data: allPayments }] =
    await Promise.all([
      // Dibungkus fetchAllRows karena Supabase/PostgREST diam-diam memotong
      // hasil di 1000 baris kalau tidak di-paginate (lihat lib/pagination.ts)
      // -- bisnis ramai ini sudah punya 1172 transaksi cuma dalam 23 hari,
      // gampang kepotong tanpa ini (ketahuan waktu verifikasi: Pendapatan
      // Penjualan Agustus sempat cuma kehitung dari 1000 transaksi pertama).
      fetchAllRows<{
        date: string;
        total: number;
        subtotal: number;
        total_item_disc: number | null;
        order_disc_amt: number | null;
        service: number | null;
        tax: number | null;
      }>((rangeFrom, rangeTo) => {
        let q = supabase
          .from("transactions")
          .select("date, total, subtotal, total_item_disc, order_disc_amt, service, tax, voided")
          .eq("business_id", businessId)
          .eq("voided", false)
          .range(rangeFrom, rangeTo);
        if (fromIso) q = q.gte("date", fromIso);
        if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
        return q;
      }),
      supabase.from("accounts").select("id, code").eq("business_id", businessId).in("code", OJOL_ACCOUNT_CODES),
      fetchKasBankLines(supabase, businessId, fromIso, toIsoExclusive),
      (() => {
        let q = supabase.from("purchases").select("date, amount").eq("business_id", businessId).order("date");
        if (purchasesUpperBound) q = q.lte("date", purchasesUpperBound);
        return q;
      })(),
      (() => {
        let q = supabase.from("purchase_payments").select("date, amount").eq("business_id", businessId).order("date");
        if (purchasesUpperBound) q = q.lte("date", purchasesUpperBound);
        return q;
      })(),
    ]);

  // Pendapatan Gofood/Grabfood/Lain-lain -- dicatat lewat akun 4-003/4-004/
  // 4-999, diinput via "Catat Kas Masuk" di halaman Kas & Bank (pilih akun
  // yang sesuai sebagai Sumber Dana). Bukan fitur input baru, cuma dibaca
  // ulang di sini dan dipisah per akun.
  const accountIdToCode = new Map((ojolAccounts ?? []).map((a) => [a.id, a.code]));
  let ojolRows: { credit: number; account_id: string; journal_entries: { date: string } }[] = [];
  if (ojolAccounts && ojolAccounts.length > 0) {
    let q = supabase
      .from("journal_lines")
      .select("credit, account_id, journal_entries!inner(date, business_id)")
      .in("account_id", ojolAccounts.map((a) => a.id))
      .eq("journal_entries.business_id", businessId);
    if (fromIso) q = q.gte("journal_entries.date", fromIso);
    if (toIsoExclusive) q = q.lt("journal_entries.date", toIsoExclusive);
    const { data } = await q;
    ojolRows = (data ?? []) as typeof ojolRows;
  }

  // Kas keluar yang beneran berlaku (void/pending/ditolak/transfer-antar-
  // rekening sudah dikecualikan oleh fetchKasBankLines) -- dipisah Tunai vs
  // Transfer dari payment_method (null diperlakukan tunai, sesuai konvensi
  // Kas Kecil yang memang selalu kas fisik).
  const kasKeluarLines = kasBank.displayLines.filter((l) => Number(l.credit) > 0);

  const dayMap = new Map<string, DayData>();
  function ensure(key: string): DayData {
    let e = dayMap.get(key);
    if (!e) {
      e = emptyDay();
      dayMap.set(key, e);
    }
    return e;
  }

  for (const t of txRows) {
    const key = toDateWib(t.date);
    const e = ensure(key);
    e.count += 1;
    e.pendapatanPenjualan += Number(t.total);
    e.diskon += Number(t.total_item_disc ?? 0) + Number(t.order_disc_amt ?? 0);
    e.service += Number(t.service ?? 0);
    e.tax += Number(t.tax ?? 0);
  }
  for (const r of ojolRows) {
    const code = accountIdToCode.get(r.account_id);
    const e = ensure(toDateWib(r.journal_entries.date));
    if (code === "4-003") e.pendapatanGofood += Number(r.credit);
    else if (code === "4-004") e.pendapatanGrabfood += Number(r.credit);
    else e.pendapatanLain += Number(r.credit);
  }
  for (const l of kasKeluarLines) {
    const e = ensure(toDateWib(l.journal_entries.date));
    if (l.journal_entries.payment_method === "transfer") {
      e.pengeluaranTransfer += Number(l.credit);
    } else {
      e.pengeluaranTunai += Number(l.credit);
    }
  }
  for (const p of allPayments ?? []) {
    if ((from && p.date < from) || (to && p.date > to)) continue;
    ensure(p.date).hutangDibayar += Number(p.amount);
  }

  function sisaHutangAsOf(dateKey: string) {
    const totalPurchases = (allPurchases ?? [])
      .filter((p) => p.date <= dateKey)
      .reduce((s, p) => s + Number(p.amount), 0);
    const totalPaid = (allPayments ?? [])
      .filter((p) => p.date <= dateKey)
      .reduce((s, p) => s + Number(p.amount), 0);
    return totalPurchases - totalPaid;
  }

  const dayList = Array.from(dayMap.entries())
    .map(([date, v]) => {
      const totalPendapatan = v.pendapatanPenjualan + v.pendapatanGofood + v.pendapatanGrabfood + v.pendapatanLain;
      const totalPengeluaran = v.pengeluaranTunai + v.pengeluaranTransfer;
      return {
        date,
        ...v,
        totalPendapatan,
        totalPengeluaran,
        persenBeban: totalPendapatan > 0 ? Math.round((totalPengeluaran / totalPendapatan) * 100) : 0,
        sisaHutang: sisaHutangAsOf(date),
        labaBersih: totalPendapatan - totalPengeluaran,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const totals = dayList.reduce(
    (acc, d) => ({
      count: acc.count + d.count,
      diskon: acc.diskon + d.diskon,
      service: acc.service + d.service,
      tax: acc.tax + d.tax,
      pendapatanPenjualan: acc.pendapatanPenjualan + d.pendapatanPenjualan,
      pendapatanGofood: acc.pendapatanGofood + d.pendapatanGofood,
      pendapatanGrabfood: acc.pendapatanGrabfood + d.pendapatanGrabfood,
      pendapatanLain: acc.pendapatanLain + d.pendapatanLain,
      totalPendapatan: acc.totalPendapatan + d.totalPendapatan,
      pengeluaranTunai: acc.pengeluaranTunai + d.pengeluaranTunai,
      pengeluaranTransfer: acc.pengeluaranTransfer + d.pengeluaranTransfer,
      totalPengeluaran: acc.totalPengeluaran + d.totalPengeluaran,
      hutangDibayar: acc.hutangDibayar + d.hutangDibayar,
      labaBersih: acc.labaBersih + d.labaBersih,
    }),
    {
      count: 0, diskon: 0, service: 0, tax: 0,
      pendapatanPenjualan: 0, pendapatanGofood: 0, pendapatanGrabfood: 0, pendapatanLain: 0, totalPendapatan: 0,
      pengeluaranTunai: 0, pengeluaranTransfer: 0, totalPengeluaran: 0,
      hutangDibayar: 0, labaBersih: 0,
    },
  );
  const totalsPersenBeban = totals.totalPendapatan > 0 ? Math.round((totals.totalPengeluaran / totals.totalPendapatan) * 100) : 0;
  const sisaHutangTerakhir = dayList[0]?.sisaHutang ?? sisaHutangAsOf(to ?? new Date().toISOString().slice(0, 10));

  const hasDiskon = dayList.some((d) => d.diskon > 0);
  const hasService = dayList.some((d) => d.service > 0);
  const hasTax = dayList.some((d) => d.tax > 0);
  const hasGofood = dayList.some((d) => d.pendapatanGofood > 0);
  const hasGrabfood = dayList.some((d) => d.pendapatanGrabfood > 0);
  const hasPendapatanLain = dayList.some((d) => d.pendapatanLain > 0);
  const hasHutang = (allPurchases ?? []).length > 0;
  const basePath = `/business/${businessId}/reports/harian`;
  const highlightLabel =
    period === "custom" && from && to
      ? `${fmtDateShort(from)} – ${fmtDateShort(to)}`
      : PERIOD_DESCRIPTIONS[period];

  return (
    <div className="w-full max-w-6xl">
      <style>{"@media print { @page { size: landscape; } }"}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-lg font-bold text-zinc-900">Laporan Harian</h1>
        <div className="flex items-center gap-2">
          <PrintHarianButton />
          <PeriodTabs basePath={basePath} period={period} />
        </div>
      </div>
      <h1 className="hidden text-lg font-bold text-zinc-900 print:block">Laporan Harian — {business!.name}</h1>

      {period === "custom" && (
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm print:hidden">
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-medium text-zinc-600">Dari
            <input type="date" name="from" defaultValue={from} className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-zinc-600">Sampai
            <input type="date" name="to" defaultValue={to} className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">Terapkan</button>
        </form>
      )}

      {dayList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada data untuk periode ini.
        </div>
      ) : (
        <>
          {/* Ringkasan total untuk seluruh periode yang dipilih (bukan cuma 1 hari) */}
          <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 p-4 print:hidden">
            <p className="text-xs font-semibold text-brand-700">{highlightLabel} — {dayList.length} hari</p>
            <div className="mt-2 flex flex-wrap gap-4">
              <div>
                <p className="text-[10px] text-brand-400 uppercase tracking-wide">Total Pendapatan</p>
                <p className="text-xl font-bold text-brand-700">{fmt(totals.totalPendapatan)}</p>
              </div>
              <div>
                <p className="text-[10px] text-brand-400 uppercase tracking-wide">Total Pengeluaran</p>
                <p className="text-xl font-bold text-red-600">{fmt(totals.totalPengeluaran)}</p>
              </div>
              <div>
                <p className="text-[10px] text-brand-400 uppercase tracking-wide">Laba Bersih</p>
                <p className={`text-xl font-bold ${totals.labaBersih >= 0 ? "text-brand-700" : "text-red-600"}`}>
                  {fmt(totals.labaBersih)}
                </p>
              </div>
            </div>
          </div>

          {hasHutang && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 print:hidden">
              <p className="text-[10px] font-semibold uppercase text-amber-700">Sisa Hutang Terkini</p>
              <p className="text-xl font-bold text-amber-700">{fmt(sisaHutangTerakhir)}</p>
              <p className="mt-1 text-[11px] text-amber-600">
                Per {fmtDateShort(to ?? new Date().toISOString().slice(0, 10))} — dari{" "}
                <Link href={`/business/${businessId}/purchases`} className="underline">Pembelian &amp; Hutang</Link>.
              </p>
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white print:overflow-visible print:rounded-none print:border-0">
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-sm print:text-[9px]">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400 print:text-[8px]">
                    <th className="px-3 py-3 print:px-1 print:py-1">Tanggal</th>
                    <th className="px-3 py-3 text-right print:px-1 print:py-1">Transaksi</th>
                    {hasDiskon && <th className="px-3 py-3 text-right print:px-1 print:py-1">Diskon</th>}
                    {hasService && <th className="px-3 py-3 text-right print:px-1 print:py-1">Service</th>}
                    {hasTax && <th className="px-3 py-3 text-right print:px-1 print:py-1">Tax</th>}
                    <th className="px-3 py-3 text-right print:px-1 print:py-1">Pendapatan Penjualan</th>
                    {hasGofood && <th className="px-3 py-3 text-right print:px-1 print:py-1">Gofood</th>}
                    {hasGrabfood && <th className="px-3 py-3 text-right print:px-1 print:py-1">Grabfood</th>}
                    {hasPendapatanLain && <th className="px-3 py-3 text-right print:px-1 print:py-1">Pendapatan Lain</th>}
                    <th className="px-3 py-3 text-right print:px-1 print:py-1">Total Pendapatan</th>
                    <th className="px-3 py-3 text-right print:px-1 print:py-1">Pengeluaran Tunai</th>
                    <th className="px-3 py-3 text-right print:px-1 print:py-1">Pengeluaran Transfer</th>
                    <th className="px-3 py-3 text-right print:px-1 print:py-1">Total Pengeluaran</th>
                    <th className="px-3 py-3 text-right print:px-1 print:py-1">% Beban</th>
                    {hasHutang && <th className="px-3 py-3 text-right print:px-1 print:py-1">Hutang Dibayar</th>}
                    {hasHutang && <th className="px-3 py-3 text-right print:px-1 print:py-1">Sisa Hutang</th>}
                    <th className="px-3 py-3 text-right print:px-1 print:py-1">Laba Bersih</th>
                  </tr>
                </thead>
                <tbody>
                  {dayList.map((d, i) => (
                    <tr key={d.date} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                      <td className="px-3 py-2.5 text-xs font-medium text-zinc-700 whitespace-nowrap print:px-1 print:py-0.5">{fmtDateShort(d.date)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-zinc-600 print:px-1 print:py-0.5">{d.count}</td>
                      {hasDiskon && <td className="px-3 py-2.5 text-right text-xs text-red-500 print:px-1 print:py-0.5">{d.diskon > 0 ? `−${fmt(d.diskon)}` : <span className="text-zinc-300">—</span>}</td>}
                      {hasService && <td className="px-3 py-2.5 text-right text-xs text-zinc-500 print:px-1 print:py-0.5">{d.service > 0 ? fmt(d.service) : <span className="text-zinc-300">—</span>}</td>}
                      {hasTax && <td className="px-3 py-2.5 text-right text-xs text-zinc-500 print:px-1 print:py-0.5">{d.tax > 0 ? fmt(d.tax) : <span className="text-zinc-300">—</span>}</td>}
                      <td className="px-3 py-2.5 text-right text-xs text-zinc-700 print:px-1 print:py-0.5">{fmt(d.pendapatanPenjualan)}</td>
                      {hasGofood && <td className="px-3 py-2.5 text-right text-xs text-zinc-700 print:px-1 print:py-0.5">{d.pendapatanGofood > 0 ? fmt(d.pendapatanGofood) : <span className="text-zinc-300">—</span>}</td>}
                      {hasGrabfood && <td className="px-3 py-2.5 text-right text-xs text-zinc-700 print:px-1 print:py-0.5">{d.pendapatanGrabfood > 0 ? fmt(d.pendapatanGrabfood) : <span className="text-zinc-300">—</span>}</td>}
                      {hasPendapatanLain && <td className="px-3 py-2.5 text-right text-xs text-zinc-700 print:px-1 print:py-0.5">{d.pendapatanLain > 0 ? fmt(d.pendapatanLain) : <span className="text-zinc-300">—</span>}</td>}
                      <td className="px-3 py-2.5 text-right text-xs font-bold text-zinc-900 print:px-1 print:py-0.5">{fmt(d.totalPendapatan)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-red-500 print:px-1 print:py-0.5">{d.pengeluaranTunai > 0 ? fmt(d.pengeluaranTunai) : <span className="text-zinc-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-red-500 print:px-1 print:py-0.5">{d.pengeluaranTransfer > 0 ? fmt(d.pengeluaranTransfer) : <span className="text-zinc-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold text-red-600 print:px-1 print:py-0.5">{fmt(d.totalPengeluaran)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-zinc-500 print:px-1 print:py-0.5">{d.persenBeban}%</td>
                      {hasHutang && <td className="px-3 py-2.5 text-right text-xs text-amber-600 print:px-1 print:py-0.5">{d.hutangDibayar > 0 ? fmt(d.hutangDibayar) : <span className="text-zinc-300">—</span>}</td>}
                      {hasHutang && <td className="px-3 py-2.5 text-right text-xs text-zinc-500 print:px-1 print:py-0.5">{fmt(d.sisaHutang)}</td>}
                      <td className={`px-3 py-2.5 text-right text-xs font-bold print:px-1 print:py-0.5 ${d.labaBersih >= 0 ? "text-brand-700" : "text-red-600"}`}>{fmt(d.labaBersih)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                  <tr>
                    <td className="px-3 py-3 text-xs font-bold text-zinc-700 print:px-1 print:py-1">Total ({dayList.length} hari)</td>
                    <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 print:px-1 print:py-1">{totals.count}</td>
                    {hasDiskon && <td className="px-3 py-3 text-right text-xs font-bold text-red-500 print:px-1 print:py-1">{totals.diskon > 0 ? `−${fmt(totals.diskon)}` : "—"}</td>}
                    {hasService && <td className="px-3 py-3 text-right text-xs font-bold text-zinc-500 print:px-1 print:py-1">{totals.service > 0 ? fmt(totals.service) : "—"}</td>}
                    {hasTax && <td className="px-3 py-3 text-right text-xs font-bold text-zinc-500 print:px-1 print:py-1">{totals.tax > 0 ? fmt(totals.tax) : "—"}</td>}
                    <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 print:px-1 print:py-1">{fmt(totals.pendapatanPenjualan)}</td>
                    {hasGofood && <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 print:px-1 print:py-1">{fmt(totals.pendapatanGofood)}</td>}
                    {hasGrabfood && <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 print:px-1 print:py-1">{fmt(totals.pendapatanGrabfood)}</td>}
                    {hasPendapatanLain && <td className="px-3 py-3 text-right text-xs font-bold text-zinc-800 print:px-1 print:py-1">{fmt(totals.pendapatanLain)}</td>}
                    <td className="px-3 py-3 text-right text-sm font-bold text-zinc-900 print:px-1 print:py-1 print:text-[9px]">{fmt(totals.totalPendapatan)}</td>
                    <td className="px-3 py-3 text-right text-xs font-bold text-red-500 print:px-1 print:py-1">{fmt(totals.pengeluaranTunai)}</td>
                    <td className="px-3 py-3 text-right text-xs font-bold text-red-500 print:px-1 print:py-1">{fmt(totals.pengeluaranTransfer)}</td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-red-600 print:px-1 print:py-1 print:text-[9px]">{fmt(totals.totalPengeluaran)}</td>
                    <td className="px-3 py-3 text-right text-xs font-bold text-zinc-500 print:px-1 print:py-1">{totalsPersenBeban}%</td>
                    {hasHutang && <td className="px-3 py-3 text-right text-xs font-bold text-amber-600 print:px-1 print:py-1">{fmt(totals.hutangDibayar)}</td>}
                    {hasHutang && <td className="px-3 py-3 text-right text-xs font-bold text-zinc-500 print:px-1 print:py-1">{fmt(sisaHutangTerakhir)}</td>}
                    <td className={`px-3 py-3 text-right text-sm font-bold print:px-1 print:py-1 print:text-[9px] ${totals.labaBersih >= 0 ? "text-brand-700" : "text-red-600"}`}>{fmt(totals.labaBersih)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p className="mt-3 text-center text-[11px] text-zinc-400 print:hidden">
            Pengeluaran ditarik dari{" "}
            <Link href={`/business/${businessId}/kas-harian`} className="text-brand-600 hover:underline">Kas &amp; Bank</Link>
            {" "}(sudah dikecualikan void/pending/ditolak/transfer antar rekening). Pendapatan Gofood/Grabfood/Lain-lain
            diinput lewat &quot;Catat Kas Masuk&quot; di Kas &amp; Bank, pilih akun 4-003 — Pendapatan Gofood, 4-004 —
            Pendapatan Grabfood, atau 4-999 — Pendapatan Lain-lain sesuai sumbernya.
          </p>
        </>
      )}
    </div>
  );
}
