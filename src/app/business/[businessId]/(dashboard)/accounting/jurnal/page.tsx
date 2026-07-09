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
import { addJournalEntry } from "./actions";
import AddJournalForm from "./add-journal-form";

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

export default async function JurnalPage({
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
    .select("code, name")
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

  const boundAddJournalEntry = addJournalEntry.bind(null, businessId);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Jurnal Transaksi — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["today", "week", "month", "all", "custom"] as Period[]).map((p) => (
            <Link
              key={p}
              href={`/business/${businessId}/accounting/jurnal?period=${p}`}
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

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">+ Jurnal Manual</h2>
        <p className="mb-4 text-[11px] text-zinc-400">
          Penjualan &amp; void sudah otomatis ter-posting dari POS. Gunakan ini untuk transaksi
          lain (setoran modal, koreksi, dll). Kesalahan input dibetulkan lewat jurnal pembalik,
          bukan hapus — sama seperti pembukuan pada umumnya.
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
            <div key={e.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900">{e.description}</p>
                  <p className="text-[11px] text-zinc-400">{formatDate(e.date)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      SOURCE_BADGE[e.source] ?? "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {SOURCE_LABELS[e.source] ?? e.source}
                  </span>
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
              <div className="h-2" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
