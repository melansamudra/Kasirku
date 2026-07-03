import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_DESCRIPTIONS,
  PERIOD_LABELS,
  REPORT_TIMEZONE,
  getPeriodRange,
  parsePeriod,
  type Period,
} from "./period";

const DONUT_PALETTE = ["#0f766e", "#34d399", "#fcd34d", "#a78bfa", "#fb923c", "#60a5fa", "#f87171"];
const CATEGORY_PALETTE = ["#0f766e", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"];
const MEDALS = ["🥇", "🥈", "🥉"];

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: REPORT_TIMEZONE,
  });
}

const hourFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: REPORT_TIMEZONE,
});

function wibHour(iso: string) {
  return Number(hourFormatter.format(new Date(iso)));
}

function buildDonutSegments(entries: [string, number][], total: number) {
  const R = 28;
  const cx = 40;
  const cy = 40;
  // Satu metode = lingkaran penuh; path arc 360° akan degenerate (titik awal == akhir).
  if (entries.length === 1) {
    return [{ d: null, color: DONUT_PALETTE[0] }];
  }
  let angle = -Math.PI / 2;
  return entries.map(([, val], i) => {
    const sweep = (val / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle);
    const y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle + sweep);
    const y2 = cy + R * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    angle += sweep;
    return {
      d: `M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} Z`,
      color: DONUT_PALETTE[i % DONUT_PALETTE.length],
    };
  });
}

export default async function ReportsPage({
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

  let txQuery = supabase
    .from("transactions")
    .select(
      "id, invoice_number, date, subtotal, total, total_cost, gross_profit, is_split, voided, transaction_items(product_id, name, category, price, qty), transaction_payments(method, amount)",
    )
    .eq("business_id", businessId)
    .order("date", { ascending: false });
  if (fromIso) txQuery = txQuery.gte("date", fromIso);
  if (toIsoExclusive) txQuery = txQuery.lt("date", toIsoExclusive);
  const { data: transactions } = await txQuery;

  const txList = transactions ?? [];
  const validTx = txList.filter((t) => !t.voided);
  const voidCount = txList.length - validTx.length;

  // ── KPI utama ──
  const revenue = validTx.reduce((s, t) => s + Number(t.total), 0);
  const count = validTx.length;
  const avg = count > 0 ? Math.round(revenue / count) : 0;
  const totalItems = validTx.reduce(
    (s, t) => s + t.transaction_items.reduce((a, i) => a + Number(i.qty), 0),
    0,
  );

  // ── Laba kotor & margin — hanya dari transaksi yang punya data modal (total_cost > 0),
  // supaya produk tanpa harga modal tidak dihitung margin 100% dan menyesatkan. ──
  const txWithCost = validTx.filter((t) => Number(t.total_cost) > 0);
  const grossProfit = txWithCost.reduce((s, t) => s + Number(t.gross_profit), 0);
  const revenueWithCost = txWithCost.reduce((s, t) => s + Number(t.subtotal), 0);
  const avgMargin =
    revenueWithCost > 0 ? Math.round((grossProfit / revenueWithCost) * 100) : null;
  const missingCostCount = validTx.length - txWithCost.length;

  // ── Tunai vs non-tunai ──
  let cashRev = 0;
  let nonCashRev = 0;
  for (const t of validTx) {
    for (const p of t.transaction_payments) {
      if (p.method === "Tunai") cashRev += Number(p.amount);
      else nonCashRev += Number(p.amount);
    }
  }

  // ── Penjualan per jam (WIB) ──
  const hourly = Array<number>(24).fill(0);
  for (const t of validTx) {
    hourly[wibHour(t.date)] += Number(t.total);
  }
  const hourlyMax = Math.max(...hourly, 1);
  const currentHour = wibHour(new Date().toISOString());

  // ── Metode pembayaran ──
  const byMethod = new Map<string, number>();
  for (const t of validTx) {
    for (const p of t.transaction_payments) {
      byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount));
    }
  }
  const methodEntries = Array.from(byMethod.entries()).sort((a, b) => b[1] - a[1]);
  const methodTotal = methodEntries.reduce((s, [, v]) => s + v, 0);
  const donutSegments = methodTotal > 0 ? buildDonutSegments(methodEntries, methodTotal) : [];

  // ── Penjualan per kategori ──
  const byCategory = new Map<string, number>();
  for (const t of validTx) {
    for (const i of t.transaction_items) {
      const cat = i.category ?? "Lainnya";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(i.price) * Number(i.qty));
    }
  }
  const categoryEntries = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  const categoryMax = categoryEntries[0]?.[1] ?? 1;

  // ── Menu terlaris ──
  const menuSales = new Map<
    string,
    { name: string; productId: string | null; qty: number; sales: number }
  >();
  for (const t of validTx) {
    for (const i of t.transaction_items) {
      const entry = menuSales.get(i.name) ?? {
        name: i.name,
        productId: i.product_id,
        qty: 0,
        sales: 0,
      };
      entry.qty += Number(i.qty);
      entry.sales += Number(i.price) * Number(i.qty);
      menuSales.set(i.name, entry);
    }
  }
  const topMenus = Array.from(menuSales.values())
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8);
  const topMax = topMenus[0]?.sales ?? 1;

  const productIds = topMenus.map((m) => m.productId).filter((id): id is string => id !== null);
  const emojiMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, emoji")
      .in("id", productIds);
    for (const p of products ?? []) {
      if (p.emoji) emojiMap.set(p.id, p.emoji);
    }
  }

  const periodQuery =
    period === "custom"
      ? `period=custom${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
      : `period=${period}`;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <Link href="/dashboard" className="text-xs font-medium text-zinc-500 hover:underline">
          ← Kembali ke dashboard
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Laporan — {business.name}</h1>
            <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["today", "week", "month", "all", "custom"] as Period[]).map((p) => (
              <Link
                key={p}
                href={`/business/${businessId}/reports?period=${p}`}
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

        {/* KPI utama */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="col-span-2 rounded-2xl bg-brand-700 p-5">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-brand-200">
              Total Pendapatan
            </p>
            <p className="text-3xl font-bold text-white">{formatRupiah(revenue)}</p>
            <p className="mt-2 inline-block rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">
              {count > 0 ? `↑ ${count} transaksi` : "— Belum ada transaksi"}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Transaksi</p>
            <p className="text-2xl font-bold text-zinc-900">{count}</p>
            <p className="mt-1 text-[11px] text-zinc-400">
              sukses · <span className="text-red-400">{voidCount} void</span>
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
              Rata-rata Bill
            </p>
            <p className="text-2xl font-bold text-zinc-900">{formatRupiah(avg)}</p>
            <p className="mt-1 text-[11px] text-zinc-400">per transaksi</p>
          </div>
        </div>

        {/* Laba kotor (HPP) */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-brand-700">
              Laba Kotor
            </p>
            <p className="text-2xl font-bold text-brand-700">{formatRupiah(grossProfit)}</p>
            <p className="mt-1 text-[11px] text-brand-600/80">
              {missingCostCount > 0
                ? `omzet − HPP (${missingCostCount} tx belum ada data modal)`
                : "omzet dikurangi HPP"}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
              Margin Rata-rata
            </p>
            <p className="text-2xl font-bold text-zinc-900">
              {avgMargin === null ? "—" : `${avgMargin}%`}
            </p>
            <p className="mt-1 text-[11px] text-zinc-400">
              {avgMargin === null ? "isi harga modal produk dulu" : "laba ÷ omzet"}
            </p>
          </div>
        </div>

        {/* KPI sekunder */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-3.5">
            <p className="mb-2 text-[10.5px] font-semibold uppercase text-zinc-400">Item Terjual</p>
            <p className="text-xl font-bold text-zinc-900">{totalItems}</p>
            <p className="mt-0.5 text-[10.5px] text-zinc-400">total qty</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3.5">
            <p className="mb-2 text-[10.5px] font-semibold uppercase text-zinc-400">
              Pendapatan Tunai
            </p>
            <p className="text-xl font-bold text-zinc-900">{formatRupiah(cashRev)}</p>
            <p className="mt-0.5 text-[10.5px] text-zinc-400">dari tunai</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3.5">
            <p className="mb-2 text-[10.5px] font-semibold uppercase text-zinc-400">Non-Tunai</p>
            <p className="text-xl font-bold text-zinc-900">{formatRupiah(nonCashRev)}</p>
            <p className="mt-0.5 text-[10.5px] text-zinc-400">transfer / kartu</p>
          </div>
        </div>

        {/* Penjualan per jam */}
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-bold text-zinc-900">Penjualan per Jam</h2>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Distribusi pendapatan sepanjang hari (WIB)
          </p>
          <div className="mt-4 flex h-28 items-end gap-1 px-1">
            {hourly.map((val, h) => {
              const hasTx = val > 0;
              const isNow = period === "today" && h === currentHour;
              const pct = Math.round((val / hourlyMax) * 100);
              return (
                <div
                  key={h}
                  className="flex flex-1 flex-col items-center justify-end"
                  title={`${h}:00 — ${formatRupiah(val)}`}
                >
                  <div
                    className={`w-full rounded-t-sm ${
                      isNow ? "bg-brand-700" : hasTx ? "bg-brand-200" : "bg-zinc-100"
                    }`}
                    style={{
                      height: `${Math.max(pct, hasTx ? 4 : 2)}%`,
                      minHeight: hasTx ? "4px" : "2px",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between px-1 text-[10px] text-zinc-300">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>
        </div>

        {/* Metode pembayaran & kategori */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-bold text-zinc-900">Metode Pembayaran</h2>
            <p className="mb-4 mt-0.5 text-[11px] text-zinc-400">Komposisi penerimaan</p>
            {methodTotal > 0 ? (
              <div className="flex items-center gap-4">
                <svg viewBox="0 0 80 80" width="80" height="80" className="shrink-0">
                  {donutSegments.map((seg, i) =>
                    seg.d === null ? (
                      <circle key={i} cx="40" cy="40" r="28" fill={seg.color} opacity="0.9" />
                    ) : (
                      <path key={i} d={seg.d} fill={seg.color} opacity="0.9" />
                    ),
                  )}
                  <circle cx="40" cy="40" r="18" fill="white" />
                  <text
                    x="40"
                    y="37"
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="700"
                    fill="#18181b"
                  >
                    {methodEntries.length}
                  </text>
                  <text x="40" y="47" textAnchor="middle" fontSize="6" fill="#71717a">
                    metode
                  </text>
                </svg>
                <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                  {methodEntries.map(([label, val], i) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }}
                        />
                        <span className="truncate font-medium text-zinc-700">{label}</span>
                      </div>
                      <span className="shrink-0 text-zinc-500">
                        {Math.round((val / methodTotal) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-zinc-300">Belum ada data</p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-bold text-zinc-900">Penjualan per Kategori</h2>
            <p className="mb-4 mt-0.5 text-[11px] text-zinc-400">Kontribusi tiap kategori menu</p>
            {categoryEntries.length > 0 ? (
              <div className="space-y-2.5">
                {categoryEntries.map(([cat, val], i) => (
                  <div key={cat}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[12.5px] font-medium text-zinc-700">{cat}</span>
                      <span className="text-xs font-bold text-zinc-600">{formatRupiah(val)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-100">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.round((val / categoryMax) * 100)}%`,
                          background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-zinc-300">Belum ada data</p>
            )}
          </div>
        </div>

        {/* Menu terlaris */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
            <h2 className="text-sm font-bold text-zinc-900">🏆 Menu Terlaris</h2>
            <span className="text-[10.5px] font-semibold uppercase text-zinc-400">periode ini</span>
          </div>
          {topMenus.length > 0 ? (
            <div className="divide-y divide-zinc-100">
              {topMenus.map((m, i) => (
                <div key={m.name} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-6 shrink-0 text-center text-base">
                    {MEDALS[i] ?? <span className="text-sm font-bold text-zinc-300">{i + 1}</span>}
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-50 text-lg">
                    {(m.productId && emojiMap.get(m.productId)) || "🛍️"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">{m.name}</p>
                      <div className="ml-2 flex shrink-0 items-center gap-2">
                        <span className="text-[11px] text-zinc-400">{m.qty}x</span>
                        <span className="text-xs font-bold text-zinc-700">
                          {formatRupiah(m.sales)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-100">
                      <div
                        className="h-1.5 rounded-full bg-brand-500"
                        style={{ width: `${Math.round((m.sales / topMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-zinc-300">Belum ada data penjualan</p>
          )}
        </div>

        {/* Ekspor */}
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-zinc-900">⬇️ Ekspor Data</h2>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`/business/${businessId}/reports/export?type=menu&${periodQuery}`}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-700"
            >
              🍽️ PenjMenu.csv
            </a>
            <a
              href={`/business/${businessId}/reports/export?type=transactions&${periodQuery}`}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-white transition-colors hover:bg-zinc-900"
            >
              🧾 PenjTransaksi.csv
            </a>
          </div>
        </div>

        {/* Riwayat transaksi periode ini */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
            <h2 className="text-sm font-bold text-zinc-900">Riwayat Transaksi</h2>
            <span className="text-[10.5px] font-semibold uppercase text-zinc-400">
              {count} transaksi
            </span>
          </div>
          {txList.length > 0 ? (
            <>
              <div className="divide-y divide-zinc-100">
                {txList.slice(0, 20).map((t) => (
                  <Link
                    key={t.id}
                    href={`/business/${businessId}/transactions/${t.id}`}
                    className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 ${
                      t.voided ? "opacity-60" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[13px] font-semibold text-zinc-900">
                          {t.invoice_number}
                        </p>
                        {t.voided && (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                            VOID
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        {formatDateTime(t.date)} · {t.transaction_items.length} item ·{" "}
                        {t.transaction_payments[0]?.method ?? "—"}
                        {t.is_split ? " · Split" : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-bold ${
                        t.voided ? "text-red-400 line-through" : "text-zinc-900"
                      }`}
                    >
                      {formatRupiah(Number(t.total))}
                    </span>
                  </Link>
                ))}
              </div>
              {txList.length > 20 && (
                <Link
                  href={`/business/${businessId}/transactions`}
                  className="block border-t border-zinc-100 px-4 py-3 text-center text-xs font-medium text-brand-600 hover:underline"
                >
                  Lihat semua transaksi →
                </Link>
              )}
            </>
          ) : (
            <div className="py-14 text-center text-zinc-300">
              <p className="text-sm">Belum ada transaksi</p>
              <p className="mt-1 text-xs text-zinc-200">
                Lakukan transaksi pertama untuk melihat laporan
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
