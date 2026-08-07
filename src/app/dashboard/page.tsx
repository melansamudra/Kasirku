import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPeriodRange, parsePeriod } from "../business/[businessId]/(dashboard)/reports/period";
import LogoutButton from "./logout-button";

function fmtFull(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}
function fmtShort(v: number) {
  if (v >= 1_000_000) return `Rp${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")} Jt`;
  if (v >= 1_000) return `Rp${Math.round(v / 1_000)} Rb`;
  return `Rp${Math.round(v)}`;
}

const PERIOD_TABS = [
  { key: "today", label: "Hari Ini" },
  { key: "week", label: "7 Hari" },
  { key: "month", label: "Bulan Ini" },
] as const;

const ACCENT: Record<string, { emoji: string; dot: string; bar: string }> = {
  fnb: { emoji: "🍽️", dot: "bg-amber-400", bar: "from-amber-400 to-orange-400" },
  retail: { emoji: "🛒", dot: "bg-sky-400", bar: "from-sky-400 to-blue-500" },
  tiket: { emoji: "🎟️", dot: "bg-violet-400", bar: "from-violet-400 to-purple-500" },
  default: { emoji: "🏪", dot: "bg-zinc-400", bar: "from-zinc-300 to-zinc-400" },
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
  if (!isOwner) {
    // Kasir non-owner langsung ke POS mereka
    if (businesses.length === 1) redirect(`/business/${businesses[0].id}/pos`);
  }

  const ownedIds = new Set(
    businesses.filter((b) => b.owner_id === user?.id).map((b) => b.id),
  );
  const businessIds = businesses.map((b) => b.id);
  const showAll = !outletParam || outletParam === "all";
  const selectedId =
    !showAll && businessIds.includes(outletParam!) ? outletParam! : null;
  const targetIds = selectedId ? [selectedId] : [...ownedIds];
  const selectedBiz = selectedId ? businesses.find((b) => b.id === selectedId) ?? null : null;

  const { fromIso } = getPeriodRange(activePeriod);
  const fromDate = fromIso ? fromIso.slice(0, 10) : null;

  const [
    { data: txRows },
    { data: ticketTxRows },
    { data: openShifts },
    { data: expenseRows },
    { data: trackedProducts },
    { data: trackedIngredients },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("business_id, total, voided")
      .in("business_id", targetIds)
      .gte("date", fromIso ?? "1970-01-01"),
    supabase
      .from("ticket_transactions")
      .select("business_id, total, voided")
      .in("business_id", targetIds)
      .gte("date", fromIso ?? "1970-01-01"),
    supabase
      .from("shifts")
      .select("business_id")
      .in("business_id", businessIds)
      .is("closed_at", null),
    supabase
      .from("expenses")
      .select("business_id, amount")
      .in("business_id", targetIds)
      .gte("date", fromDate ?? "1970-01-01"),
    supabase
      .from("products")
      .select("business_id, stock, min_stock")
      .in("business_id", businessIds)
      .is("deleted_at", null)
      .gt("min_stock", 0),
    supabase
      .from("ingredients")
      .select("business_id, stock, min_stock")
      .in("business_id", businessIds)
      .is("deleted_at", null)
      .gt("min_stock", 0),
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

  const lowStock = new Map<string, number>();
  for (const item of [...(trackedProducts ?? []), ...(trackedIngredients ?? [])]) {
    if (Number(item.stock) <= Number(item.min_stock)) {
      lowStock.set(item.business_id, (lowStock.get(item.business_id) ?? 0) + 1);
    }
  }

  let totalRevenue = 0,
    totalCount = 0,
    totalExpense = 0;
  for (const s of summary.values()) {
    totalRevenue += s.revenue;
    totalCount += s.count;
    totalExpense += s.expense;
  }

  const initial = (user?.email ?? "?").charAt(0).toUpperCase();
  const periodLabel = PERIOD_TABS.find((t) => t.key === activePeriod)?.label ?? "Hari Ini";
  const ownedBusinesses = businesses.filter((b) => ownedIds.has(b.id));

  function outletHref(id: string | "all") {
    return `/dashboard?outlet=${id}&period=${activePeriod}`;
  }
  function periodHref(p: string) {
    return `/dashboard?outlet=${selectedId ?? "all"}&period=${p}`;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* ════════════ SIDEBAR (desktop) ════════════ */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
        {/* User */}
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-brand-600">Pemilik</p>
            <p className="truncate text-xs font-semibold text-zinc-800">{user?.email}</p>
          </div>
        </div>

        {/* Nav outlet */}
        <nav className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Outlet
          </p>

          {/* Semua Outlet */}
          <Link
            href={outletHref("all")}
            className={`mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              showAll
                ? "bg-brand-600 text-white"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base ${showAll ? "bg-white/20" : "bg-zinc-100"}`}
            >
              🏠
            </span>
            <span className="truncate">Semua Outlet</span>
            {showAll && (
              <span className="ml-auto text-[10px] opacity-70">{ownedBusinesses.length} toko</span>
            )}
          </Link>

          {/* Per-outlet */}
          {ownedBusinesses.map((b) => {
            const acc = ACCENT[b.business_type] ?? ACCENT.default;
            const isSelected = selectedId === b.id;
            const shiftOpen = openShiftSet.has(b.id);
            const low = lowStock.get(b.id) ?? 0;
            return (
              <div key={b.id} className="mb-0.5">
                <Link
                  href={outletHref(b.id)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    isSelected
                      ? "bg-brand-600 text-white"
                      : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${isSelected ? "bg-white/20" : "bg-zinc-100"}`}
                  >
                    {acc.emoji}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {shiftOpen && (
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${isSelected ? "bg-white" : "bg-brand-500"}`}
                    />
                  )}
                </Link>

                {/* Expanded actions when selected */}
                {isSelected && (
                  <div className="mb-1 ml-3 mt-1 flex gap-1.5 pl-7">
                    <Link
                      href={`/business/${b.id}/pos`}
                      className="flex-1 rounded-lg bg-brand-50 py-1.5 text-center text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                    >
                      🛎 Kasir
                    </Link>
                    <Link
                      href={`/business/${b.id}`}
                      className="flex-1 rounded-lg border border-zinc-200 py-1.5 text-center text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                    >
                      Kelola
                    </Link>
                  </div>
                )}

                {low > 0 && (
                  <p
                    className={`ml-12 text-[10px] font-medium ${isSelected ? "text-red-200" : "text-red-500"}`}
                  >
                    ⚠ {low} stok rendah
                  </p>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="space-y-1 border-t border-zinc-100 p-3">
          {isOwner && (
            <Link
              href="/onboarding"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-zinc-100 text-sm">
                ＋
              </span>
              Tambah Toko
            </Link>
          )}
          <div className="px-1">
            <LogoutButton variant="inline" />
          </div>
        </div>
      </aside>

      {/* ════════════ MAIN ════════════ */}
      <main className="flex-1 overflow-auto">
        {/* Mobile outlet picker */}
        <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
          <Link
            href={outletHref("all")}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${showAll ? "bg-brand-600 text-white" : "border border-zinc-200 text-zinc-600"}`}
          >
            🏠 Semua
          </Link>
          {ownedBusinesses.map((b) => {
            const acc = ACCENT[b.business_type] ?? ACCENT.default;
            return (
              <Link
                key={b.id}
                href={outletHref(b.id)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${selectedId === b.id ? "bg-brand-600 text-white" : "border border-zinc-200 text-zinc-600"}`}
              >
                {acc.emoji} {b.name}
              </Link>
            );
          })}
        </div>

        <div className="px-6 py-6">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-zinc-900">
                {selectedBiz ? selectedBiz.name : "Semua Outlet"}
              </h1>
              <p className="text-sm text-zinc-400">
                {isOwner ? "Dashboard Pemilik" : "Dashboard"} · {periodLabel}
              </p>
            </div>
            {/* Mobile logout */}
            <div className="md:hidden">
              <LogoutButton variant="inline" />
            </div>
          </div>

          {/* Period tabs */}
          <div className="mb-5 flex w-fit gap-1 rounded-xl bg-white p-1 shadow-sm">
            {PERIOD_TABS.map((tab) => (
              <Link
                key={tab.key}
                href={periodHref(tab.key)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                  activePeriod === tab.key
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          {/* Aggregate stats */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                Total Omset
              </p>
              <p className="mt-1 break-all text-xl font-bold text-zinc-900">
                {fmtFull(totalRevenue)}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {selectedBiz ? selectedBiz.name : "gabungan semua"}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                Transaksi
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{totalCount}</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {selectedBiz ? selectedBiz.name : "gabungan semua"}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                Pengeluaran
              </p>
              <p className="mt-1 break-all text-xl font-bold text-red-600">
                {fmtFull(totalExpense)}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {selectedBiz ? selectedBiz.name : "gabungan semua"}
              </p>
            </div>
          </div>

          {/* ── Semua outlet: comparison cards ── */}
          {showAll && ownedBusinesses.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-bold text-zinc-500 uppercase tracking-wide">
                Perbandingan Outlet
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {ownedBusinesses.map((b) => {
                  const s = summary.get(b.id) ?? { revenue: 0, count: 0, expense: 0 };
                  const acc = ACCENT[b.business_type] ?? ACCENT.default;
                  const shiftOpen = openShiftSet.has(b.id);
                  const low = lowStock.get(b.id) ?? 0;
                  const pct =
                    totalRevenue > 0 ? Math.round((s.revenue / totalRevenue) * 100) : 0;
                  return (
                    <Link
                      key={b.id}
                      href={outletHref(b.id)}
                      className="group relative overflow-hidden rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div
                        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${acc.bar}`}
                      />
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{acc.emoji}</span>
                          <div>
                            <p className="font-bold text-zinc-900">{b.name}</p>
                            {shiftOpen ? (
                              <p className="text-[11px] font-medium text-brand-600">● Shift aktif</p>
                            ) : (
                              <p className="text-[11px] text-zinc-400">○ Tutup</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-600">
                            {pct}% omset
                          </span>
                          {low > 0 && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                              ⚠ {low} stok
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Revenue bar */}
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${acc.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-zinc-50 p-2">
                          <p className="text-[9px] font-bold uppercase text-zinc-400">Omset</p>
                          <p className="text-sm font-bold text-zinc-900">{fmtShort(s.revenue)}</p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 p-2">
                          <p className="text-[9px] font-bold uppercase text-zinc-400">Trx</p>
                          <p className="text-sm font-bold text-zinc-900">{s.count}</p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 p-2">
                          <p className="text-[9px] font-bold uppercase text-zinc-400">Pengeluaran</p>
                          <p className="text-sm font-bold text-red-500">{fmtShort(s.expense)}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Single outlet: quick actions + laporan link ── */}
          {selectedBiz && (
            <div>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
                Aksi Cepat
              </h2>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/business/${selectedBiz.id}/pos`}
                  className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700"
                >
                  🛎️ Buka Kasir
                </Link>
                {ownedIds.has(selectedBiz.id) && (
                  <Link
                    href={`/business/${selectedBiz.id}`}
                    className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                  >
                    ⚙️ Kelola Toko
                  </Link>
                )}
                <Link
                  href={`/business/${selectedBiz.id}/reports`}
                  className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  📊 Laporan Lengkap
                </Link>
              </div>

              {/* Single outlet detail stats */}
              {(() => {
                const s = summary.get(selectedBiz.id) ?? { revenue: 0, count: 0, expense: 0 };
                const netProfit = s.revenue - s.expense;
                const margin = s.revenue > 0 ? Math.round((netProfit / s.revenue) * 100) : 0;
                return (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                        Laba Bersih (Est.)
                      </p>
                      <p
                        className={`mt-1 text-xl font-bold ${netProfit >= 0 ? "text-brand-700" : "text-red-600"}`}
                      >
                        {fmtFull(netProfit)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">omset − pengeluaran</p>
                    </div>
                    <div className="rounded-xl bg-white p-4 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                        Margin (Est.)
                      </p>
                      <p
                        className={`mt-1 text-xl font-bold ${margin >= 0 ? "text-brand-700" : "text-red-600"}`}
                      >
                        {margin}%
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">laba / omset</p>
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
