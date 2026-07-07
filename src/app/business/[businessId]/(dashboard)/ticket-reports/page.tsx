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
} from "../reports/period";

const DONUT_PALETTE = ["#0f766e", "#34d399", "#fcd34d", "#a78bfa", "#fb923c", "#60a5fa", "#f87171"];

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
    timeZone: "Asia/Jakarta",
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

export default async function TicketReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    category?: string;
    serialFrom?: string;
    serialTo?: string;
  }>;
}) {
  const { businessId } = await params;
  const {
    period: periodParam,
    from,
    to,
    category: categoryFilter,
    serialFrom,
    serialTo,
  } = await searchParams;
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

  const { data: categories } = await supabase
    .from("ticket_categories")
    .select("id, name")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  const { count: activeMemberCount } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .gte("valid_until", today);

  let txQuery = supabase
    .from("ticket_transactions")
    .select("id, invoice_number, date, total, payment_method, voided")
    .eq("business_id", businessId)
    .order("date", { ascending: false });
  if (fromIso) txQuery = txQuery.gte("date", fromIso);
  if (toIsoExclusive) txQuery = txQuery.lt("date", toIsoExclusive);
  const { data: ticketTransactions } = await txQuery;

  const txMap = new Map((ticketTransactions ?? []).map((t) => [t.id, t]));
  const txIds = Array.from(txMap.keys());

  let serials: {
    id: string;
    serial_no: number;
    manual_number: string;
    price: number;
    is_member_price: boolean;
    ticket_transaction_id: string;
    ticket_categories: { name: string } | null;
  }[] = [];

  if (txIds.length > 0) {
    let serialQuery = supabase
      .from("ticket_serials")
      .select(
        "id, serial_no, manual_number, price, is_member_price, ticket_transaction_id, ticket_categories(name)",
      )
      .in("ticket_transaction_id", txIds)
      .order("serial_no", { ascending: true });
    if (categoryFilter) serialQuery = serialQuery.eq("ticket_category_id", categoryFilter);
    if (serialFrom) serialQuery = serialQuery.gte("serial_no", Number(serialFrom));
    if (serialTo) serialQuery = serialQuery.lte("serial_no", Number(serialTo));
    const { data } = await serialQuery;
    serials = (data ?? []) as unknown as typeof serials;
  }

  const rows = serials
    .map((s) => ({ ...s, tx: txMap.get(s.ticket_transaction_id) }))
    .filter((s) => s.tx !== undefined) as (typeof serials[number] & {
    tx: {
      id: string;
      invoice_number: string;
      date: string;
      total: number;
      payment_method: string;
      voided: boolean;
    };
  })[];

  const validRows = rows.filter((r) => !r.tx.voided);
  const totalTickets = validRows.length;
  const totalRevenue = validRows.reduce((s, r) => s + Number(r.price), 0);

  // ── Penjualan per jam (WIB) — berdasar tiap tiket terjual, sama seperti export "Per Jam" ──
  const hourly = Array<number>(24).fill(0);
  for (const r of validRows) {
    hourly[wibHour(r.tx.date)] += Number(r.price);
  }
  const hourlyMax = Math.max(...hourly, 1);
  const currentHour = wibHour(new Date().toISOString());

  // ── Metode pembayaran — per transaksi (bukan per tiket), pakai total transaksi ──
  const validTx = Array.from(txMap.values()).filter((t) => !t.voided);
  const byMethod = new Map<string, number>();
  for (const t of validTx) {
    byMethod.set(t.payment_method, (byMethod.get(t.payment_method) ?? 0) + Number(t.total));
  }
  const methodEntries = Array.from(byMethod.entries()).sort((a, b) => b[1] - a[1]);
  const methodTotal = methodEntries.reduce((s, [, v]) => s + v, 0);
  const donutSegments = methodTotal > 0 ? buildDonutSegments(methodEntries, methodTotal) : [];

  const byCategory = new Map<string, { qty: number; revenue: number }>();
  for (const r of validRows) {
    const name = r.ticket_categories?.name ?? "Lainnya";
    const entry = byCategory.get(name) ?? { qty: 0, revenue: 0 };
    entry.qty += 1;
    entry.revenue += Number(r.price);
    byCategory.set(name, entry);
  }
  const categorySummary = Array.from(byCategory.entries()).sort((a, b) => b[1].revenue - a[1].revenue);

  const filterQuery = new URLSearchParams();
  if (categoryFilter) filterQuery.set("category", categoryFilter);
  if (serialFrom) filterQuery.set("serialFrom", serialFrom);
  if (serialTo) filterQuery.set("serialTo", serialTo);

  const periodQuery =
    period === "custom"
      ? `period=custom${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
      : `period=${period}`;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Laporan Tiket — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["today", "week", "month", "all", "custom"] as Period[]).map((p) => (
            <Link
              key={p}
              href={`/business/${businessId}/ticket-reports?period=${p}&${filterQuery.toString()}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                p === period ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {PERIOD_LABELS[p]}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-brand-700 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-brand-200">
            Anggota Aktif
          </p>
          <p className="text-2xl font-bold text-white">{activeMemberCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
            Tiket Terjual
          </p>
          <p className="text-2xl font-bold text-zinc-900">{totalTickets}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Pendapatan</p>
          <p className="text-xl font-bold text-zinc-900">{formatRupiah(totalRevenue)}</p>
        </div>
      </div>

      {/* Filter */}
      <form
        method="get"
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
      >
        <input type="hidden" name="period" value={period} />
        {period === "custom" && (
          <>
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
          </>
        )}
        <label className="text-xs font-medium text-zinc-600">
          Kategori
          <select
            name="category"
            defaultValue={categoryFilter ?? ""}
            className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
          >
            <option value="">Semua kategori</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600">
          No. Seri Dari
          <input
            type="number"
            name="serialFrom"
            min="1"
            defaultValue={serialFrom}
            className="mt-1 block w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          No. Seri Sampai
          <input
            type="number"
            name="serialTo"
            min="1"
            defaultValue={serialTo}
            className="mt-1 block w-24 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Terapkan
        </button>
      </form>

      {/* Penjualan per jam */}
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-bold text-zinc-900">Penjualan per Jam</h2>
        <p className="mt-0.5 text-[11px] text-zinc-400">
          Distribusi pendapatan tiket sepanjang hari (WIB)
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

      {/* Metode pembayaran & ringkasan kategori */}
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
                <text x="40" y="37" textAnchor="middle" fontSize="8" fontWeight="700" fill="#18181b">
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
          <h2 className="text-sm font-bold text-zinc-900">Ringkasan per Kategori</h2>
          {categorySummary.length > 0 ? (
            <div className="mt-3 space-y-2">
              {categorySummary.map(([name, s]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-700">
                    {name} <span className="text-zinc-400">({s.qty} tiket)</span>
                  </span>
                  <span className="font-bold text-zinc-900">{formatRupiah(s.revenue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-zinc-300">Belum ada data</p>
          )}
        </div>
      </div>

      {/* Ekspor */}
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-zinc-900">⬇️ Ekspor Data</h2>
        <div className="grid grid-cols-3 gap-2">
          <a
            href={`/business/${businessId}/ticket-reports/export?type=transactions&${periodQuery}`}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-700"
          >
            🧾 Transaksi
          </a>
          <a
            href={`/business/${businessId}/ticket-reports/export?type=tickets&${periodQuery}&${filterQuery.toString()}`}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-white transition-colors hover:bg-zinc-900"
          >
            🎟️ Per Tiket
          </a>
          <a
            href={`/business/${businessId}/ticket-reports/export?type=hourly&${periodQuery}&${filterQuery.toString()}`}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-white transition-colors hover:bg-zinc-900"
          >
            ⏱️ Per Jam
          </a>
        </div>
      </div>

      {/* Rekonsiliasi nomor seri */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Rekonsiliasi Tiket</h2>
          <span className="text-[10.5px] font-semibold uppercase text-zinc-400">
            {rows.length} tiket
          </span>
        </div>
        {rows.length > 100 && (
          <p className="border-b border-zinc-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-700">
            Menampilkan 100 tiket pertama (urut nomor seri) dari {rows.length}. Persempit periode,
            kategori, atau rentang nomor seri untuk melihat sisanya.
          </p>
        )}
        {rows.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {rows.slice(0, 100).map((r) => (
              <Link
                key={r.id}
                href={`/business/${businessId}/ticket-reports/${r.tx.id}`}
                className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 ${
                  r.tx.voided ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-900">
                    #{r.serial_no} — {r.ticket_categories?.name ?? "Lainnya"}
                    {r.is_member_price && (
                      <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                        Member
                      </span>
                    )}
                    {r.tx.voided && (
                      <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                        VOID
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {r.tx.invoice_number} · fisik #{r.manual_number} · {formatDateTime(r.tx.date)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-bold ${
                    r.tx.voided ? "text-red-400 line-through" : "text-zinc-900"
                  }`}
                >
                  {formatRupiah(Number(r.price))}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="py-14 text-center text-sm text-zinc-300">Belum ada tiket terjual</p>
        )}
      </div>
    </div>
  );
}
