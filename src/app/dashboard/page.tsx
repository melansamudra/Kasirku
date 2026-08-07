import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPeriodRange, parsePeriod } from "../business/[businessId]/(dashboard)/reports/period";
import LogoutButton from "./logout-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

const BUSINESS_TYPE_ACCENT: Record<
  string,
  { emoji: string; bar: string; chip: string; label: string; icon: string }
> = {
  fnb: {
    emoji: "🍽️",
    label: "Restoran / Kafe / F&B",
    icon: "bg-amber-50 text-amber-600",
    bar: "from-amber-400 to-orange-400",
    chip: "bg-amber-50 text-amber-700",
  },
  retail: {
    emoji: "🛒",
    label: "Retail / Toko",
    icon: "bg-sky-50 text-sky-600",
    bar: "from-sky-400 to-blue-500",
    chip: "bg-sky-50 text-sky-700",
  },
  tiket: {
    emoji: "🎟️",
    label: "Tempat Wisata / Tiket",
    icon: "bg-violet-50 text-violet-600",
    bar: "from-violet-400 to-purple-500",
    chip: "bg-violet-50 text-violet-700",
  },
};

const DEFAULT_ACCENT = {
  emoji: "🏪",
  label: "Toko",
  icon: "bg-zinc-100 text-zinc-600",
  bar: "from-zinc-300 to-zinc-400",
  chip: "bg-zinc-100 text-zinc-700",
};

const PERIOD_TABS = [
  { key: "today", label: "Hari Ini" },
  { key: "week", label: "7 Hari" },
  { key: "month", label: "Bulan Ini" },
] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period = parsePeriod(periodParam);
  const activePeriod = (["today", "week", "month"] as const).includes(period as "today" | "week" | "month")
    ? (period as "today" | "week" | "month")
    : "today";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS returns businesses owned by user + businesses where user is active staff
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, business_type, owner_id")
    .order("created_at", { ascending: true });

  if (!businesses || businesses.length === 0) {
    redirect("/onboarding");
  }

  // Kasir/staff: bukan owner dari bisnis manapun
  const isOwner = businesses.some((b) => b.owner_id === user?.id);
  if (!isOwner) {
    if (businesses.length === 1) {
      redirect(`/business/${businesses[0].id}/pos`);
    }
  }

  const businessIds = businesses.map((b) => b.id);
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
      .in("business_id", businessIds)
      .gte("date", fromIso ?? "1970-01-01"),
    supabase
      .from("ticket_transactions")
      .select("business_id, total, voided")
      .in("business_id", businessIds)
      .gte("date", fromIso ?? "1970-01-01"),
    supabase
      .from("shifts")
      .select("business_id")
      .in("business_id", businessIds)
      .is("closed_at", null),
    supabase
      .from("expenses")
      .select("business_id, amount")
      .in("business_id", businessIds)
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

  // Per-outlet summary
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

  const lowStockCount = new Map<string, number>();
  for (const item of [...(trackedProducts ?? []), ...(trackedIngredients ?? [])]) {
    if (Number(item.stock) <= Number(item.min_stock)) {
      lowStockCount.set(item.business_id, (lowStockCount.get(item.business_id) ?? 0) + 1);
    }
  }

  // Aggregate totals (owner only — owned businesses)
  const ownedIds = new Set(businesses.filter((b) => b.owner_id === user?.id).map((b) => b.id));
  let totalRevenue = 0;
  let totalCount = 0;
  let totalExpense = 0;
  for (const [id, s] of summary) {
    if (ownedIds.has(id)) {
      totalRevenue += s.revenue;
      totalCount += s.count;
      totalExpense += s.expense;
    }
  }

  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen flex-1 overflow-hidden bg-zinc-50 px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-brand-100/60 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-base font-bold text-white shadow-md shadow-brand-600/20">
              {initial}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                {isOwner ? "Dashboard Pemilik" : "Selamat datang"}
              </p>
              <h1 className="text-lg font-bold text-zinc-900">{user?.email}</h1>
            </div>
          </div>
          <LogoutButton variant="inline" />
        </div>

        {/* Period tabs — owner only */}
        {isOwner && (
          <div className="mb-5 flex gap-1.5 rounded-xl bg-white p-1.5 shadow-sm w-fit">
            {PERIOD_TABS.map((tab) => (
              <Link
                key={tab.key}
                href={`/dashboard?period=${tab.key}`}
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
        )}

        {/* Aggregate stats — owner only */}
        {isOwner && (
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Total Omset
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{formatRupiah(totalRevenue)}</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">semua outlet</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Total Transaksi
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900">{totalCount}</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">semua outlet</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Total Pengeluaran
              </p>
              <p className="mt-1 text-xl font-bold text-red-600">{formatRupiah(totalExpense)}</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">semua outlet</p>
            </div>
          </div>
        )}

        {/* Outlet cards */}
        <div className="grid gap-5 sm:grid-cols-2">
          {businesses.map((b) => {
            const s = summary.get(b.id) ?? { revenue: 0, count: 0, expense: 0 };
            const shiftOpen = openShiftSet.has(b.id);
            const lowStock = lowStockCount.get(b.id) ?? 0;
            const accent = BUSINESS_TYPE_ACCENT[b.business_type] ?? DEFAULT_ACCENT;
            const isOwned = b.owner_id === user?.id;
            const periodLabel = PERIOD_TABS.find((t) => t.key === activePeriod)?.label ?? "Hari Ini";

            return (
              <div
                key={b.id}
                className="relative overflow-hidden rounded-xl bg-white shadow-sm p-5 transition-shadow hover:shadow-md"
              >
                <div
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent.bar}`}
                />

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${accent.icon}`}
                    >
                      {accent.emoji}
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900">{b.name}</p>
                      <p className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${accent.chip}`}>
                        {accent.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {shiftOpen ? (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                        ● Shift aktif
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                        ○ Tutup
                      </span>
                    )}
                    {lowStock > 0 && isOwned && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                        ⚠️ {lowStock} stok rendah
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                    <p className="text-[9px] font-semibold uppercase text-zinc-400">Omset</p>
                    <p className="text-sm font-bold text-zinc-900">{formatRupiah(s.revenue)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                    <p className="text-[9px] font-semibold uppercase text-zinc-400">Transaksi</p>
                    <p className="text-sm font-bold text-zinc-900">{s.count}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                    <p className="text-[9px] font-semibold uppercase text-zinc-400">Pengeluaran</p>
                    <p className="text-sm font-bold text-red-500">{formatRupiah(s.expense)}</p>
                  </div>
                </div>
                <p className="mt-1 text-right text-[10px] text-zinc-400">{periodLabel}</p>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/business/${b.id}/pos`}
                    className="flex-1 rounded-xl bg-brand-600 py-2.5 text-center text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700"
                  >
                    🛎️ Buka Kasir
                  </Link>
                  {isOwned && (
                    <Link
                      href={`/business/${b.id}`}
                      className="flex items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                    >
                      Kelola →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}

          {isOwner && (
            <Link
              href="/onboarding"
              className="flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 p-5 text-zinc-400 transition-colors hover:border-brand-300 hover:text-brand-600"
            >
              <span className="text-2xl">＋</span>
              <span className="text-sm font-semibold">Tambah Toko Baru</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
