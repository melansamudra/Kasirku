import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PURCHASE_CATEGORIES = new Set(["Pembelian Bahan Baku", "Pembelian Barang Dagang"]);
const REPORT_TIMEZONE = "Asia/Jakarta";

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatRupiahShort(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(1)} Jt`;
  if (abs >= 1_000) return `${sign}Rp${Math.round(abs / 1_000)} Rb`;
  return formatRupiah(value);
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE });
}

function monthLabel(monthStr: string) {
  return new Date(`${monthStr}-01T00:00:00Z`).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function wibStartOfDay(dateStr: string) {
  return `${dateStr}T00:00:00+07:00`;
}

export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const today = todayStr();
  const monthStart = `${today.slice(0, 7)}-01`;
  const daysSoFar = Number(today.slice(8, 10));

  const { data: transactions } = await supabase
    .from("transactions")
    .select("date, total")
    .eq("business_id", businessId)
    .eq("voided", false)
    .gte("date", wibStartOfDay(monthStart));

  const { data: expenses } = await supabase
    .from("expenses")
    .select("date, category, amount")
    .eq("business_id", businessId)
    .gte("date", monthStart);

  const { data: openShift } = await supabase
    .from("shifts")
    .select("id")
    .eq("business_id", businessId)
    .is("closed_at", null)
    .maybeSingle();

  const revenue = (transactions ?? []).reduce((s, t) => s + Number(t.total), 0);
  const txCount = (transactions ?? []).length;
  const totalExpenses = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const cogs = (expenses ?? [])
    .filter((e) => PURCHASE_CATEGORIES.has(e.category))
    .reduce((s, e) => s + Number(e.amount), 0);
  const operationalExpenses = totalExpenses - cogs;
  const netProfit = revenue - totalExpenses;
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;
  const marginDisplay = revenue > 0 ? margin : null;
  const ringPct = Math.max(0, Math.min(100, margin));

  // ── Arus kas harian (pemasukan vs pengeluaran) bulan berjalan ──
  const revenueByDay = new Array(daysSoFar).fill(0);
  for (const t of transactions ?? []) {
    const day = Number(
      new Date(t.date).toLocaleString("en-CA", {
        timeZone: REPORT_TIMEZONE,
        day: "2-digit",
      }),
    );
    if (day >= 1 && day <= daysSoFar) revenueByDay[day - 1] += Number(t.total);
  }
  const expenseByDay = new Array(daysSoFar).fill(0);
  for (const e of expenses ?? []) {
    const day = Number(e.date.slice(8, 10));
    if (day >= 1 && day <= daysSoFar) expenseByDay[day - 1] += Number(e.amount);
  }

  const chartW = 640;
  const chartH = 180;
  const maxVal = Math.max(...revenueByDay, ...expenseByDay, 1);
  const stepX = daysSoFar > 1 ? chartW / (daysSoFar - 1) : 0;
  const toPoints = (arr: number[]) =>
    arr
      .map((v, i) => `${Math.round(i * stepX)},${Math.round(chartH - (v / maxVal) * chartH)}`)
      .join(" ");
  const revenuePoints = toPoints(revenueByDay);
  const expensePoints = toPoints(expenseByDay);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Dashboard</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ringkasan keuangan — {monthLabel(today.slice(0, 7))}
          </p>
        </div>
        {openShift && (
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
            ● Shift aktif
          </span>
        )}
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
            Total Pendapatan
          </p>
          <p className="text-xl font-bold text-zinc-900">{formatRupiahShort(revenue)}</p>
          <p className="mt-0.5 text-[10.5px] text-zinc-400">{monthLabel(today.slice(0, 7))}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Laba Bersih</p>
          <p
            className={`text-xl font-bold ${netProfit >= 0 ? "text-zinc-900" : "text-red-600"}`}
          >
            {formatRupiahShort(netProfit)}
          </p>
          <p className="mt-0.5 text-[10.5px] text-zinc-400">
            {marginDisplay === null ? "belum ada penjualan" : `Margin ${marginDisplay}%`}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Total Beban</p>
          <p className="text-xl font-bold text-zinc-900">{formatRupiahShort(totalExpenses)}</p>
          <p className="mt-0.5 text-[10.5px] text-zinc-400">HPP + Operasional</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Transaksi</p>
          <p className="text-xl font-bold text-zinc-900">{txCount}</p>
          <p className="mt-0.5 text-[10.5px] text-zinc-400">bulan ini</p>
        </div>
      </div>

      {/* Arus kas & margin */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900">Arus Kas Harian</h2>
            <span className="text-[11px] text-zinc-400">{monthLabel(today.slice(0, 7))}</span>
          </div>
          {revenue > 0 || totalExpenses > 0 ? (
            <>
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="mt-4 h-40 w-full"
                preserveAspectRatio="none"
              >
                <polyline
                  points={revenuePoints}
                  fill="none"
                  stroke="var(--color-brand-500)"
                  strokeWidth="2"
                />
                <polyline points={expensePoints} fill="none" stroke="#f97316" strokeWidth="2" />
              </svg>
              <div className="mt-2 flex gap-4 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand-500" /> Pemasukan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-orange-500" /> Pengeluaran
                </span>
              </div>
            </>
          ) : (
            <p className="py-14 text-center text-xs text-zinc-300">
              Belum ada transaksi bulan ini
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-bold text-zinc-900">Net Profit Margin</h2>
          <p className="mt-0.5 text-[11px] text-zinc-400">Bulan ini</p>
          <div className="mt-4 flex flex-col items-center">
            <svg viewBox="0 0 120 120" width="120" height="120">
              <circle cx="60" cy="60" r="48" fill="none" stroke="#e4e4e7" strokeWidth="14" />
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="var(--color-brand-600)"
                strokeWidth="14"
                strokeDasharray={`${(ringPct / 100) * 2 * Math.PI * 48} ${2 * Math.PI * 48}`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="56" textAnchor="middle" fontSize="20" fontWeight="700" fill="#18181b">
                {marginDisplay === null ? "—" : `${marginDisplay}%`}
              </text>
              <text x="60" y="74" textAnchor="middle" fontSize="10" fill="#71717a">
                margin
              </text>
            </svg>
            <p className="mt-2 text-xs text-zinc-500">Laba: {formatRupiah(netProfit)}</p>
          </div>
        </div>
      </div>

      {/* Ringkasan beban */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1 text-[10.5px] font-semibold uppercase text-amber-700">HPP (Pembelian)</p>
          <p className="text-lg font-bold text-zinc-900">{formatRupiah(cogs)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1 text-[10.5px] font-semibold uppercase text-zinc-500">Beban Operasional</p>
          <p className="text-lg font-bold text-zinc-900">{formatRupiah(operationalExpenses)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/business/${businessId}/reports/laba-rugi`}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Lihat Laba Rugi lengkap →
        </Link>
        <Link
          href={`/business/${businessId}/reports`}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Lihat Laporan lengkap →
        </Link>
      </div>
    </div>
  );
}
