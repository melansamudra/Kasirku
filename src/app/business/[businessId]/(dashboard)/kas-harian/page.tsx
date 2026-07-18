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
import AddCashForm from "./add-cash-form";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  penjualan: "Penjualan",
  void: "Void",
  pembelian: "Pembelian",
  beban: "Beban",
  payroll: "Payroll",
};

const SOURCE_BADGE: Record<string, string> = {
  manual: "bg-zinc-100 text-zinc-600",
  penjualan: "bg-brand-50 text-brand-700",
  void: "bg-red-50 text-red-600",
  pembelian: "bg-amber-50 text-amber-700",
  beban: "bg-amber-50 text-amber-700",
  payroll: "bg-sky-50 text-sky-700",
};

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type CashLine = {
  id: string;
  debit: number;
  credit: number;
  journal_entries: { id: string; date: string; description: string; source: string };
};

export default async function KasHarianPage({
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

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: kasAccount } = await supabase
    .from("accounts")
    .select("id")
    .eq("business_id", businessId)
    .eq("code", "1-001")
    .single();

  // Sebuah jurnal manual yang sudah dibatalkan lewat "↩ Koreksi" (lihat halaman
  // Jurnal Transaksi) plus jurnal koreksi-nya sendiri secara matematis saling
  // meniadakan (net 0) — keduanya tetap muncul di Jurnal Transaksi sebagai
  // jejak audit, tapi di sini (ringkasan kas harian untuk pemilik toko yang
  // bukan akuntan) itu cuma bikin bingung: seolah ada uang masuk/keluar
  // padahal transaksinya sudah dianulir. Disaring biar Kas Harian cuma
  // menampilkan pergerakan kas yang benar-benar masih berlaku.
  const { data: reversals } = await supabase
    .from("journal_entries")
    .select("source_id")
    .eq("business_id", businessId)
    .eq("source", "koreksi");
  const reversedEntryIds = new Set((reversals ?? []).map((r) => r.source_id));

  let lines: CashLine[] = [];
  if (kasAccount) {
    let lineQuery = supabase
      .from("journal_lines")
      .select("id, debit, credit, journal_entries!inner(id, date, description, source, business_id)")
      .eq("account_id", kasAccount.id)
      .eq("journal_entries.business_id", businessId);
    if (fromIso) lineQuery = lineQuery.gte("journal_entries.date", fromIso);
    if (toIsoExclusive) lineQuery = lineQuery.lt("journal_entries.date", toIsoExclusive);
    const { data } = await lineQuery;
    lines = ((data ?? []) as unknown as CashLine[])
      .filter(
        (l) =>
          l.journal_entries.source !== "koreksi" &&
          !reversedEntryIds.has(l.journal_entries.id),
      )
      .slice()
      .sort(
        (a, b) => new Date(b.journal_entries.date).getTime() - new Date(a.journal_entries.date).getTime(),
      );
  }

  const totalMasuk = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalKeluar = lines.reduce((s, l) => s + Number(l.credit), 0);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Kas Harian — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/kas-harian`} period={period} />
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

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-brand-700">Kas Masuk</p>
          <p className="text-xl font-bold text-brand-700">{formatRupiah(totalMasuk)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-red-600">Kas Keluar</p>
          <p className="text-xl font-bold text-red-600">{formatRupiah(totalKeluar)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">+ Catat Kas Masuk/Keluar</h2>
        <AddCashForm businessId={businessId} today={todayWibDateString()} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Kas</h2>
        </div>
        {lines.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {lines.map((l) => {
              const isMasuk = Number(l.debit) > 0;
              return (
                <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-zinc-900">
                      {l.journal_entries.description}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-[11px] text-zinc-400">
                        {formatDate(l.journal_entries.date)}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          SOURCE_BADGE[l.journal_entries.source] ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {SOURCE_LABELS[l.journal_entries.source] ?? l.journal_entries.source}
                      </span>
                    </div>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-bold ${isMasuk ? "text-brand-700" : "text-red-600"}`}
                  >
                    {isMasuk ? "+" : "-"}
                    {formatRupiah(isMasuk ? Number(l.debit) : Number(l.credit))}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada transaksi kas di periode ini</p>
        )}
      </div>
    </div>
  );
}
