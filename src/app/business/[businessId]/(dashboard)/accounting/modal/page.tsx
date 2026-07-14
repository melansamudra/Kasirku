import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  getPeriodRange,
  parsePeriod,
} from "../../reports/period";
import PeriodTabs from "../../reports/period-tabs";
import { addCapitalMovement } from "./actions";
import CapitalForm from "./capital-form";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AccountRow = { id: string; code: string; type: string; normal_balance: string };

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

// Total Modal (Modal Pemilik + Laba Ditahan + Laba Berjalan) as of a point in
// time — same 3-part sum Neraca uses, evaluated at an arbitrary cutoff so it
// can be diffed across a period. `strictlyBeforeIso: null` means "since the
// business's inception" (i.e. balance 0, there's nothing before that).
async function totalModalAsOf(
  supabase: SupabaseServerClient,
  businessId: string,
  accounts: AccountRow[],
  strictlyBeforeIso: string | null,
): Promise<number> {
  if (strictlyBeforeIso === null) return 0;

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId)
    .lt("date", strictlyBeforeIso);

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

  let modalTotal = 0;
  let pendapatanTotal = 0;
  let bebanTotal = 0;
  for (const a of accounts) {
    const raw = balanceByAccount.get(a.id) ?? 0;
    const balance = a.normal_balance === "debit" ? raw : -raw;
    if (a.type === "modal") modalTotal += balance;
    else if (a.type === "pendapatan") pendapatanTotal += balance;
    else if (a.type === "beban") bebanTotal += balance;
  }
  return modalTotal + pendapatanTotal - bebanTotal;
}

export default async function LaporanPerubahanModalPage({
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
    .select("id, code, type, normal_balance")
    .eq("business_id", businessId)
    .in("type", ["modal", "pendapatan", "beban"]);

  const accountRows = (accounts ?? []) as AccountRow[];
  const modalPemilikAccount = accountRows.find((a) => a.code === "3-001");

  // "Now" as an upper cutoff for open-ended periods (today/week/month/all).
  const nowIso = new Date().toISOString();
  const modalAkhirCutoff = toIsoExclusive ?? nowIso;

  const [modalAwal, modalAkhir] = await Promise.all([
    totalModalAsOf(supabase, businessId, accountRows, fromIso),
    totalModalAsOf(supabase, businessId, accountRows, modalAkhirCutoff),
  ]);

  let setoran = 0;
  let prive = 0;
  if (modalPemilikAccount) {
    let periodQuery = supabase
      .from("journal_entries")
      .select("journal_lines(debit, credit, account_id)")
      .eq("business_id", businessId);
    if (fromIso) periodQuery = periodQuery.gte("date", fromIso);
    if (toIsoExclusive) periodQuery = periodQuery.lt("date", toIsoExclusive);
    const { data: periodEntries } = await periodQuery;

    for (const entry of periodEntries ?? []) {
      const lines = entry.journal_lines as unknown as {
        debit: number;
        credit: number;
        account_id: string;
      }[];
      for (const l of lines) {
        if (l.account_id !== modalPemilikAccount.id) continue;
        setoran += Number(l.credit);
        prive += Number(l.debit);
      }
    }
  }

  const labaBersihPeriode = modalAkhir - modalAwal - (setoran - prive);

  const boundAddCapital = addCapitalMovement.bind(null, businessId);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Perubahan Modal — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/accounting/modal`} period={period} />
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
        <div className="space-y-2.5 p-5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Modal Awal</span>
            <span className="font-semibold text-zinc-900">{formatRupiah(modalAwal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">+ Setoran Modal</span>
            <span className="font-semibold text-brand-700">{formatRupiah(setoran)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">− Prive (Penarikan Pribadi)</span>
            <span className="font-semibold text-red-500">
              {prive > 0 ? `−${formatRupiah(prive)}` : formatRupiah(0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">
              {labaBersihPeriode >= 0 ? "+ Laba Bersih Periode Ini" : "− Rugi Bersih Periode Ini"}
            </span>
            <span
              className={`font-semibold ${labaBersihPeriode >= 0 ? "text-brand-700" : "text-red-500"}`}
            >
              {formatRupiah(labaBersihPeriode)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-base font-bold text-zinc-900">
            <span>Modal Akhir</span>
            <span>{formatRupiah(modalAkhir)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Catat Setoran / Prive</h2>
        <CapitalForm action={boundAddCapital} today={today} />
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        &quot;Laba Bersih Periode Ini&quot; dihitung dari selisih Total Modal awal dan akhir periode,
        dikurangi setoran/prive — jadi tetap akurat walau ada{" "}
        <Link href={`/business/${businessId}/accounting/tutup-buku`} className="text-brand-600 hover:underline">
          Tutup Buku
        </Link>{" "}
        di tengah periode.
      </p>
    </div>
  );
}
