import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { BookOpen, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import { StatCard } from "@/components/ui/stat-card";
import { PillBadge, type PillTone } from "@/components/ui/pill-badge";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  getPeriodRange,
  parsePeriod,
} from "../../reports/period";
import PeriodTabs from "../../reports/period-tabs";
import { addJournalEntry } from "./actions";
import AddJournalForm from "./add-journal-form";
import ReverseJournalButton from "./reverse-journal-button";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  penjualan: "Penjualan",
  void: "Void",
  pembelian: "Pembelian",
  beban: "Beban",
  payroll: "Payroll",
  koreksi: "Koreksi",
};

const SOURCE_PILL_TONE: Record<string, PillTone> = {
  manual: "zinc",
  penjualan: "green",
  void: "red",
  pembelian: "amber",
  beban: "amber",
  payroll: "blue",
  koreksi: "red",
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

export default async function JurnalPage({
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

  const { data: accounts } = await supabase
    .from("accounts")
    .select("code, name, type, normal_balance")
    .eq("business_id", businessId)
    .order("code", { ascending: true });

  let entryQuery = supabase
    .from("journal_entries")
    .select("id, date, description, source, journal_lines(debit, credit, accounts(code, name))")
    .eq("business_id", businessId)
    .order("date", { ascending: false });
  if (fromIso) entryQuery = entryQuery.gte("date", fromIso);
  if (toIsoExclusive) entryQuery = entryQuery.lt("date", toIsoExclusive);
  const { data: entries } = await entryQuery;

  // Terlepas dari filter periode yang sedang aktif — sebuah jurnal manual
  // lama (di luar rentang tanggal yang sedang dilihat) tetap tidak boleh
  // ditawari tombol "Koreksi" lagi kalau sudah pernah dikoreksi sebelumnya.
  const { data: reversals } = await supabase
    .from("journal_entries")
    .select("source_id")
    .eq("business_id", businessId)
    .eq("source", "koreksi");
  const reversedEntryIds = new Set((reversals ?? []).map((r) => r.source_id));

  const boundAddJournalEntry = addJournalEntry.bind(null, businessId);
  const today = todayWibDateString();

  const entryTotals = (entries ?? []).map((e) => {
    const lines = e.journal_lines as unknown as { debit: number; credit: number }[];
    return lines.reduce((s, l) => s + Number(l.debit), 0);
  });
  const totalNominal = entryTotals.reduce((s, v) => s + v, 0);
  const periodQuery =
    period === "custom"
      ? `period=custom${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
      : `period=${period}`;

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Jurnal Transaksi — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/accounting/jurnal`} period={period} />
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

      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatCard label="Jumlah Entri" value={String((entries ?? []).length)} icon={BookOpen} tone="zinc" />
        <StatCard label="Total Nominal" value={formatRupiah(totalNominal)} icon={Wallet} tone="brand" />
      </div>

      <a
        href={`/business/${businessId}/export?${periodQuery}`}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-bold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50"
      >
        📊 Export Semua Laporan Akuntansi (Excel)
      </a>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">+ Jurnal Manual</h2>
        <p className="mb-4 text-[11px] text-zinc-400">
          Penjualan &amp; void sudah otomatis ter-posting dari POS. Gunakan ini untuk transaksi
          lain (setoran modal, dll). Salah input? Jurnal yang sudah diposting tidak bisa diedit
          — klik &quot;↩ Koreksi&quot; pada jurnal tersebut untuk membalikkannya secara otomatis,
          lalu posting jurnal baru yang benar.
        </p>
        <AddJournalForm action={boundAddJournalEntry} today={today} accounts={accounts ?? []} />
      </div>

      <div className="mt-4 space-y-3">
        {(entries ?? []).length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-300">
            Belum ada jurnal di periode ini.
          </p>
        )}
        {(entries ?? []).map((e) => {
          const lines = e.journal_lines as unknown as {
            debit: number;
            credit: number;
            accounts: { code: string; name: string } | null;
          }[];
          const total = lines.reduce((s, l) => s + Number(l.debit), 0);
          return (
            <div key={e.id} className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">{e.description}</p>
                  <p className="text-[11px] text-zinc-400">{formatDate(e.date)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PillBadge tone={SOURCE_PILL_TONE[e.source] ?? "zinc"}>
                    {SOURCE_LABELS[e.source] ?? e.source}
                  </PillBadge>
                  <span className="text-xs font-bold text-zinc-700">{formatRupiah(total)}</span>
                </div>
              </div>
              <div className="divide-y divide-zinc-50 px-4">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="text-zinc-600">
                      {l.accounts?.code} — {l.accounts?.name}
                    </span>
                    <span className="font-medium text-zinc-800">
                      {Number(l.debit) > 0 ? formatRupiah(l.debit) : ""}
                      {Number(l.credit) > 0 ? `(${formatRupiah(l.credit)})` : ""}
                    </span>
                  </div>
                ))}
              </div>
              {e.source === "manual" && !reversedEntryIds.has(e.id) && (
                <ReverseJournalButton businessId={businessId} entryId={e.id} />
              )}
              <div className="h-2" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
