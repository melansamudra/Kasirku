import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPeriodRange } from "../business/[businessId]/(dashboard)/reports/period";
import LogoutButton from "./logout-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

const BUSINESS_TYPE_ACCENT: Record<
  string,
  { emoji: string; label: string; icon: string; bar: string; chip: string }
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, business_type")
    .order("created_at", { ascending: true });

  if (!businesses || businesses.length === 0) {
    redirect("/onboarding");
  }

  const businessIds = businesses.map((b) => b.id);
  const { fromIso } = getPeriodRange("today");

  const { data: todayTx } = await supabase
    .from("transactions")
    .select("business_id, total, voided")
    .in("business_id", businessIds)
    .gte("date", fromIso ?? undefined);

  const { data: todayTicketTx } = await supabase
    .from("ticket_transactions")
    .select("business_id, total, voided")
    .in("business_id", businessIds)
    .gte("date", fromIso ?? undefined);

  const { data: openShifts } = await supabase
    .from("shifts")
    .select("business_id")
    .in("business_id", businessIds)
    .is("closed_at", null);

  const openShiftBusinessIds = new Set((openShifts ?? []).map((s) => s.business_id));

  const { data: trackedProducts } = await supabase
    .from("products")
    .select("business_id, stock, min_stock")
    .in("business_id", businessIds)
    .is("deleted_at", null)
    .gt("min_stock", 0);

  const { data: trackedIngredients } = await supabase
    .from("ingredients")
    .select("business_id, stock, min_stock")
    .in("business_id", businessIds)
    .is("deleted_at", null)
    .gt("min_stock", 0);

  const lowStockCount = new Map<string, number>();
  for (const item of [...(trackedProducts ?? []), ...(trackedIngredients ?? [])]) {
    if (Number(item.stock) <= Number(item.min_stock)) {
      lowStockCount.set(item.business_id, (lowStockCount.get(item.business_id) ?? 0) + 1);
    }
  }

  const todaySummary = new Map<string, { revenue: number; count: number }>();
  for (const t of [...(todayTx ?? []), ...(todayTicketTx ?? [])]) {
    if (t.voided) continue;
    const entry = todaySummary.get(t.business_id) ?? { revenue: 0, count: 0 };
    entry.revenue += Number(t.total);
    entry.count += 1;
    todaySummary.set(t.business_id, entry);
  }

  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen flex-1 overflow-hidden bg-zinc-50 px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-brand-100/60 blur-3xl"
      />

      <div className="relative mx-auto w-full max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-base font-bold text-white shadow-md shadow-brand-600/20">
              {initial}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                Selamat datang kembali
              </p>
              <h1 className="text-lg font-bold text-zinc-900">{user?.email}</h1>
            </div>
          </div>
          <LogoutButton variant="inline" />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {businesses.map((b) => {
            const summary = todaySummary.get(b.id) ?? { revenue: 0, count: 0 };
            const shiftOpen = openShiftBusinessIds.has(b.id);
            const lowStock = lowStockCount.get(b.id) ?? 0;
            const accent = BUSINESS_TYPE_ACCENT[b.business_type] ?? DEFAULT_ACCENT;
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
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${accent.icon}`}
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
                    {shiftOpen && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                        ● Shift aktif
                      </span>
                    )}
                    {lowStock > 0 && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                        ⚠️ {lowStock} stok rendah
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-zinc-50 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase text-zinc-400">
                      Penjualan Hari Ini
                    </p>
                    <p className="text-base font-bold text-zinc-900">
                      {formatRupiah(summary.revenue)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase text-zinc-400">
                      Transaksi
                    </p>
                    <p className="text-base font-bold text-zinc-900">{summary.count}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/business/${b.id}/pos`}
                    className="flex-1 rounded-xl bg-brand-600 py-2.5 text-center text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700"
                  >
                    🛎️ Buka Kasir
                  </Link>
                  <Link
                    href={`/business/${b.id}`}
                    className="flex items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                  >
                    Kelola →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
