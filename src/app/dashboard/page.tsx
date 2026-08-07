import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPeriodRange, parsePeriod } from "../business/[businessId]/(dashboard)/reports/period";
import LogoutButton from "./logout-button";

function fmtCompact(v: number) {
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")} Jt`;
  if (v >= 1_000) return `Rp ${Math.round(v / 1_000)} Rb`;
  if (v === 0) return "Rp 0";
  return `Rp ${Math.round(v).toLocaleString("id-ID")}`;
}
function fmtFull(v: number) {
  return `Rp ${Math.round(v).toLocaleString("id-ID")}`;
}

const PERIOD_TABS = [
  { key: "today", label: "Hari Ini" },
  { key: "week", label: "7 Hari" },
  { key: "month", label: "Bulan Ini" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  fnb: "Restoran / F&B",
  retail: "Retail / Toko",
  tiket: "Wisata / Tiket",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; outlet?: string }>;
}) {
  const { period: periodParam, outlet: outletParam } = await searchParams;
  const period = parsePeriod(periodParam);
  const activePeriod = (["today", "week", "month"] as const).includes(
    period as "today" | "week" | "month",
  )
    ? (period as "today" | "week" | "month")
    : "today";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, business_type, owner_id")
    .order("created_at", { ascending: true });

  if (!businesses || businesses.length === 0) redirect("/onboarding");

  const isOwner = businesses.some((b) => b.owner_id === user?.id);
  if (!isOwner && businesses.length === 1) {
    redirect(`/business/${businesses[0].id}/pos`);
  }

  const ownedIds = new Set(
    businesses.filter((b) => b.owner_id === user?.id).map((b) => b.id),
  );
  const ownedBusinesses = businesses.filter((b) => ownedIds.has(b.id));
  const showAll = !outletParam || outletParam === "all";
  const selectedId =
    !showAll && businesses.some((b) => b.id === outletParam) ? outletParam! : null;
  const selectedBiz = selectedId ? businesses.find((b) => b.id === selectedId) ?? null : null;
  const targetIds = selectedId ? [selectedId] : [...ownedIds];

  const { fromIso } = getPeriodRange(activePeriod);
  const fromDate = fromIso ? fromIso.slice(0, 10) : null;

  const [
    { data: txRows },
    { data: ticketTxRows },
    { data: openShifts },
    { data: expenseRows },
  ] = await Promise.all([
    supabase.from("transactions").select("business_id, total, voided, date")
      .in("business_id", targetIds).gte("date", fromIso ?? "1970-01-01"),
    supabase.from("ticket_transactions").select("business_id, total, voided, date")
      .in("business_id", targetIds).gte("date", fromIso ?? "1970-01-01"),
    supabase.from("shifts").select("business_id")
      .in("business_id", businesses.map((b) => b.id)).is("closed_at", null),
    supabase.from("expenses").select("business_id, amount")
      .in("business_id", targetIds).gte("date", fromDate ?? "1970-01-01"),
  ]);

  const openShiftSet = new Set((openShifts ?? []).map((s) => s.business_id));

  const summary = new Map<string, { revenue: number; count: number; expense: number }>();
  for (const t of [...(txRows ?? []), ...(ticketTxRows ?? [])]) {
    if (t.voided) continue;
    const e = summary.get(t.business_id) ?? { revenue: 0, count: 0, expense: 0 };
    e.revenue += Number(t.total);
    e.count += 1;
    summary.set(t.business_id, e);
  }
  for (const ex of expenseRows ?? []) {
    const e = summary.get(ex.business_id) ?? { revenue: 0, count: 0, expense: 0 };
    e.expense += Number(ex.amount);
    summary.set(ex.business_id, e);
  }

  let totalRevenue = 0, totalCount = 0, totalExpense = 0;
  for (const s of summary.values()) {
    totalRevenue += s.revenue;
    totalCount += s.count;
    totalExpense += s.expense;
  }

  // ── Chart data ──
  const WIB = "Asia/Jakarta";
  const wibDateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: WIB });
  const wibHourFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: WIB });
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: WIB });

  const allTx = [...(txRows ?? []), ...(ticketTxRows ?? [])].filter((t) => !t.voided);

  let chartBars: number[];
  let chartTooltips: string[];
  let xAxisLabels: string[];

  if (activePeriod === "today") {
    const hourly = Array<number>(24).fill(0);
    for (const t of allTx) hourly[Number(wibHourFmt.format(new Date(t.date)))] += Number(t.total);
    chartBars = hourly;
    chartTooltips = hourly.map((v, h) => `${String(h).padStart(2, "0")}:00 — ${fmtFull(v)}`);
    xAxisLabels = ["00:00", "06:00", "12:00", "18:00", "23:00"];
  } else if (activePeriod === "week") {
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toLocaleDateString("en-CA", { timeZone: WIB }));
    }
    const dailyMap = new Map<string, number>();
    for (const t of allTx) {
      const d = wibDateFmt.format(new Date(t.date));
      dailyMap.set(d, (dailyMap.get(d) ?? 0) + Number(t.total));
    }
    chartBars = dates.map((d) => dailyMap.get(d) ?? 0);
    chartTooltips = dates.map((d, i) => `${d} — ${fmtFull(chartBars[i])}`);
    xAxisLabels = dates.map((d) =>
      new Date(d + "T12:00:00+07:00").toLocaleDateString("id-ID", { weekday: "short", timeZone: WIB }),
    );
  } else {
    // month
    const monthStart = `${todayStr.slice(0, 7)}-01`;
    const dates: string[] = [];
    let cur = monthStart;
    while (cur <= todayStr) {
      dates.push(cur);
      const next = new Date(cur + "T12:00:00+07:00");
      next.setDate(next.getDate() + 1);
      cur = next.toLocaleDateString("en-CA", { timeZone: WIB });
    }
    const dailyMap = new Map<string, number>();
    for (const t of allTx) {
      const d = wibDateFmt.format(new Date(t.date));
      dailyMap.set(d, (dailyMap.get(d) ?? 0) + Number(t.total));
    }
    chartBars = dates.map((d) => dailyMap.get(d) ?? 0);
    chartTooltips = dates.map((d, i) => `${d} — ${fmtFull(chartBars[i])}`);
    const step = Math.max(1, Math.floor(dates.length / 5));
    xAxisLabels = dates
      .filter((_, i) => i === 0 || i === dates.length - 1 || i % step === 0)
      .map((d) => d.slice(8));
  }

  const chartMax = Math.max(...chartBars, 1);
  const peakIdx = chartBars.indexOf(Math.max(...chartBars));

  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  function outletHref(id: string | "all") {
    return `/dashboard?outlet=${id}&period=${activePeriod}`;
  }
  function periodHref(p: string) {
    return `/dashboard?outlet=${selectedId ?? "all"}&period=${p}`;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">

      {/* ── Sidebar ── */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-zinc-100">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-zinc-900">{user?.email}</p>
            <p className="text-[10px] text-zinc-400">Pemilik</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            Outlet
          </p>

          <Link
            href={outletHref("all")}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              showAll
                ? "bg-brand-50 font-semibold text-brand-700"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${showAll ? "bg-brand-600" : "bg-zinc-300"}`} />
            Semua Outlet
          </Link>

          {ownedBusinesses.map((b) => {
            const isSelected = selectedId === b.id;
            const shiftOpen = openShiftSet.has(b.id);
            return (
              <div key={b.id}>
                <Link
                  href={outletHref(b.id)}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isSelected ? "bg-brand-600" : "bg-zinc-300"}`} />
                    <span className="truncate">{b.name}</span>
                  </div>
                  {shiftOpen && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                  )}
                </Link>
                {isSelected && (
                  <div className="mb-1 ml-6 mt-0.5 flex gap-1">
                    <Link href={`/business/${b.id}/pos`} className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 transition-colors">
                      Kasir
                    </Link>
                    <Link href={`/business/${b.id}`} className="rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors">
                      Kelola
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-zinc-100 px-3 py-3 space-y-1">
          {isOwner && (
            <Link href="/onboarding" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors">
              + Tambah Toko
            </Link>
          )}
          <div className="px-3">
            <LogoutButton variant="inline" />
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-auto">

        {/* Mobile outlet pills */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
          <Link href={outletHref("all")} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${showAll ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600"}`}>
            Semua
          </Link>
          {ownedBusinesses.map((b) => (
            <Link key={b.id} href={outletHref(b.id)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${selectedId === b.id ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600"}`}>
              {b.name}
            </Link>
          ))}
        </div>

        <div className="mx-auto max-w-4xl px-6 py-8">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">
                {selectedBiz ? selectedBiz.name : "Semua Outlet"}
              </h1>
              {selectedBiz && (
                <p className="mt-0.5 text-sm text-zinc-400">
                  {TYPE_LABEL[selectedBiz.business_type] ?? "Toko"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:block">
                <LogoutButton variant="inline" />
              </div>
            </div>
          </div>

          {/* Period tabs */}
          <div className="mb-6 flex gap-0 rounded-lg border border-zinc-200 bg-white p-0.5 w-fit">
            {PERIOD_TABS.map((tab) => (
              <Link
                key={tab.key}
                href={periodHref(tab.key)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activePeriod === tab.key
                    ? "bg-brand-600 text-white"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          {/* KPI cards */}
          <div className="mb-8 grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-white p-5 shadow-sm border border-zinc-100">
              <p className="text-xs font-medium text-zinc-400">Total Omset</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">{fmtFull(totalRevenue)}</p>
              <p className="mt-1 text-xs text-zinc-400">{selectedBiz?.name ?? "semua outlet"}</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm border border-zinc-100">
              <p className="text-xs font-medium text-zinc-400">Transaksi</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">{totalCount}</p>
              <p className="mt-1 text-xs text-zinc-400">{selectedBiz?.name ?? "semua outlet"}</p>
            </div>
            <div className="rounded-xl bg-white p-5 shadow-sm border border-zinc-100">
              <p className="text-xs font-medium text-zinc-400">Pengeluaran</p>
              <p className={`mt-2 text-2xl font-bold tracking-tight ${totalExpense > 0 ? "text-red-500" : "text-zinc-900"}`}>
                {fmtFull(totalExpense)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{selectedBiz?.name ?? "semua outlet"}</p>
            </div>
          </div>

          {/* ── Chart ── */}
          <div className="mb-6 rounded-xl bg-white border border-zinc-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-zinc-700">Trend Pendapatan</p>
                <p className="text-xs text-zinc-400">
                  {activePeriod === "today" ? "Per jam (WIB)" : activePeriod === "week" ? "7 hari terakhir" : "Bulan ini per hari"}
                </p>
              </div>
              <p className="text-sm font-bold text-zinc-900">{fmtFull(totalRevenue)}</p>
            </div>
            <div className="px-5 py-5">
              <div className="flex h-24 items-end gap-0.5">
                {chartBars.map((val, i) => {
                  const pct = Math.round((val / chartMax) * 100);
                  const hasTx = val > 0;
                  const isPeak = i === peakIdx && hasTx;
                  return (
                    <div
                      key={i}
                      className="flex flex-1 flex-col items-center justify-end"
                      title={chartTooltips[i]}
                    >
                      <div
                        className={`w-full rounded-t transition-all ${
                          isPeak ? "bg-brand-600" : hasTx ? "bg-brand-300" : "bg-zinc-100"
                        }`}
                        style={{
                          height: `${Math.max(pct, hasTx ? 5 : 1)}%`,
                          minHeight: hasTx ? "5px" : "1px",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-zinc-400">
                {xAxisLabels.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Semua outlet: tabel perbandingan ── */}
          {showAll && ownedBusinesses.length > 0 && (
            <div className="rounded-xl bg-white border border-zinc-100 shadow-sm overflow-hidden">
              <div className="border-b border-zinc-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-700">Outlet</h2>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[1fr_7rem_5rem_5rem_auto] gap-4 border-b border-zinc-100 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                <span>Nama</span>
                <span className="text-right">Omset</span>
                <span className="text-right">Transaksi</span>
                <span className="text-right">Pengeluaran</span>
                <span />
              </div>

              <div className="divide-y divide-zinc-100">
                {ownedBusinesses.map((b) => {
                  const s = summary.get(b.id) ?? { revenue: 0, count: 0, expense: 0 };
                  const shiftOpen = openShiftSet.has(b.id);
                  return (
                    <div key={b.id} className="grid grid-cols-[1fr_7rem_5rem_5rem_auto] items-center gap-4 px-5 py-4 hover:bg-zinc-50 transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-zinc-900">{b.name}</p>
                          {shiftOpen
                            ? <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">Shift aktif</span>
                            : <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-400">Tutup</span>
                          }
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-400">{TYPE_LABEL[b.business_type] ?? "Toko"}</p>
                      </div>
                      <p className="text-right text-sm font-semibold text-zinc-900">{fmtCompact(s.revenue)}</p>
                      <p className="text-right text-sm text-zinc-600">{s.count}</p>
                      <p className={`text-right text-sm font-medium ${s.expense > 0 ? "text-red-500" : "text-zinc-400"}`}>
                        {s.expense > 0 ? fmtCompact(s.expense) : "—"}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Link href={`/business/${b.id}/pos`} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors whitespace-nowrap">
                          Kasir
                        </Link>
                        <Link href={`/business/${b.id}`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors whitespace-nowrap">
                          Kelola
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isOwner && (
                <div className="border-t border-zinc-100 px-5 py-3">
                  <Link href="/onboarding" className="text-xs font-medium text-zinc-400 hover:text-brand-600 transition-colors">
                    + Tambah toko baru
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ── Single outlet: aksi cepat + detail ── */}
          {selectedBiz && (
            <div className="space-y-4">
              {/* Quick actions */}
              <div className="flex gap-2">
                <Link href={`/business/${selectedBiz.id}/pos`} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
                  Buka Kasir
                </Link>
                {ownedIds.has(selectedBiz.id) && (
                  <Link href={`/business/${selectedBiz.id}`} className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
                    Kelola Toko
                  </Link>
                )}
                <Link href={`/business/${selectedBiz.id}/reports`} className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
                  Laporan
                </Link>
              </div>

              {/* Outlet stats */}
              {(() => {
                const s = summary.get(selectedBiz.id) ?? { revenue: 0, count: 0, expense: 0 };
                const net = s.revenue - s.expense;
                const margin = s.revenue > 0 ? Math.round((net / s.revenue) * 100) : null;
                const shiftOpen = openShiftSet.has(selectedBiz.id);
                return (
                  <div className="rounded-xl bg-white border border-zinc-100 shadow-sm overflow-hidden">
                    <div className="border-b border-zinc-100 px-5 py-4 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-zinc-700">Detail Outlet</h2>
                      {shiftOpen
                        ? <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">Shift sedang aktif</span>
                        : <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-400">Shift tutup</span>
                      }
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {[
                        { label: "Omset", value: fmtFull(s.revenue) },
                        { label: "Pengeluaran", value: fmtFull(s.expense), red: s.expense > 0 },
                        { label: "Laba Bersih (est.)", value: fmtFull(net), red: net < 0, green: net > 0 },
                        { label: "Margin (est.)", value: margin !== null ? `${margin}%` : "—" },
                        { label: "Transaksi", value: `${s.count} transaksi` },
                      ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                          <span className="text-sm text-zinc-500">{row.label}</span>
                          <span className={`text-sm font-semibold tabular-nums ${row.red ? "text-red-500" : row.green ? "text-brand-700" : "text-zinc-900"}`}>
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
