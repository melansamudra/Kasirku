import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import { PERIOD_COOKIE_NAME, PERIOD_DESCRIPTIONS, getPeriodRange, parsePeriod } from "../../../reports/period";
import PeriodTabs from "../../../reports/period-tabs";
import { addExpense } from "../../../finance/actions";
import DeleteExpenseButton from "../../../finance/delete-expense-button";
import AddLocationExpenseForm from "./add-location-expense-form";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function LocationBiayaPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { businessId, locationId } = await params;
  const { period: periodParam, from, to } = await searchParams;
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);

  const supabase = await createClient();
  const today = todayWibDateString();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) {
    notFound();
  }

  let expQuery = supabase
    .from("expenses")
    .select("id, date, category, amount, note")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .order("date", { ascending: false });
  if (fromIso) expQuery = expQuery.gte("date", fromIso.slice(0, 10));
  if (toIsoExclusive) expQuery = expQuery.lt("date", toIsoExclusive.slice(0, 10));
  const { data: expenses } = await expQuery;

  const total = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));
  }

  const boundAddExpense = addExpense.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Biaya Operasional — {location.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/lokasi/${locationId}/biaya`} period={period} />
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Listrik, gas, dan biaya lain di luar bahan baku &amp; tenaga kerja — tercatat sebagai
        pengeluaran khusus lokasi ini, sekaligus otomatis masuk jurnal akuntansi seperti
        pengeluaran biasa.
      </p>

      {period === "custom" && (
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4">
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

      <div className="mt-4 rounded-xl bg-brand-700 p-4">
        <p className="text-[11px] font-medium text-brand-200">Total Biaya Periode Ini</p>
        <p className="text-lg font-bold text-white">{formatRupiah(total)}</p>
        {byCategory.size > 0 && (
          <div className="mt-2 space-y-0.5">
            {[...byCategory.entries()].map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-[11px] text-brand-100">
                <span>{cat}</span>
                <span>{formatRupiah(amt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Catat Biaya</h2>
        <AddLocationExpenseForm action={boundAddExpense} today={today} locationId={locationId} />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Biaya</h2>
          <span className="text-[10.5px] font-semibold uppercase text-zinc-400">
            {expenses?.length ?? 0} tercatat
          </span>
        </div>
        {expenses && expenses.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-zinc-900">{e.category}</p>
                  <p className="truncate text-[11px] text-zinc-400">
                    {formatDate(e.date)}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-zinc-900">{formatRupiah(Number(e.amount))}</span>
                <DeleteExpenseButton businessId={businessId} expenseId={e.id} />
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-14 text-center text-xs text-zinc-400">Belum ada biaya tercatat.</p>
        )}
      </div>
    </div>
  );
}
