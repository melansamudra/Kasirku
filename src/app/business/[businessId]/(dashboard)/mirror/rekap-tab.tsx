import { createClient } from "@/lib/supabase/server";
import LockMonthButton from "./lock-month-button";
import DownloadRekapButton from "./download-rekap-button";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function txWibMonthKey(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).slice(0, 7);
}

function monthLabel(monthKey: string): string {
  return new Date(monthKey + "-02T00:00:00").toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

type TxRow = {
  id: string;
  date: string;
  invoice_number: string;
  total: number;
  voided: boolean;
  transaction_payments: { method: string; amount: number }[];
  transaction_items: { name: string; category: string | null; qty: number; price: number }[];
};

export default async function RekapTab({
  businessId,
  bulan,
}: {
  businessId: string;
  bulan?: string;
}) {
  const supabase = await createClient();

  const [{ data: markedRows }, { data: lockRows }] = await Promise.all([
    supabase
      .from("mirror_visible_transactions")
      .select("transaction_id")
      .eq("business_id", businessId),
    supabase
      .from("mirror_month_locks")
      .select("month_year")
      .eq("business_id", businessId),
  ]);

  const markedIds = (markedRows ?? []).map((r) => r.transaction_id as string);
  const lockedSet = new Set((lockRows ?? []).map((r) => r.month_year as string));

  if (markedIds.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-400">
        Belum ada transaksi yang ditandai untuk mirror.
      </p>
    );
  }

  // Fetch transaction details in chunks to avoid HTTP URL length limit
  // (Supabase .in() puts all IDs in the URL; 1000+ UUIDs = ~37KB, exceeds server limits)
  const CHUNK_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < markedIds.length; i += CHUNK_SIZE) {
    chunks.push(markedIds.slice(i, i + CHUNK_SIZE));
  }

  const dateRange = bulan ? (() => {
    const start = `${bulan}-01T00:00:00+07:00`;
    const nextMonth = new Date(bulan + "-02T00:00:00");
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const end =
      nextMonth.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).slice(0, 7) +
      "-01T00:00:00+07:00";
    return { start, end };
  })() : null;

  const chunkResults = await Promise.all(
    chunks.map((chunk) => {
      let q = supabase
        .from("transactions")
        .select(
          "id, date, invoice_number, total, voided, transaction_payments(method, amount), transaction_items(name, category, qty, price)",
        )
        .in("id", chunk)
        .eq("business_id", businessId)
        .order("date", { ascending: false });
      if (dateRange) q = q.gte("date", dateRange.start).lt("date", dateRange.end);
      return q;
    }),
  );

  const txs = chunkResults
    .flatMap((r) => (r.data ?? []) as unknown as TxRow[])
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const activeTxs = txs.filter((t) => !t.voided);

  // --- Agregasi per bulan ---
  const monthMap = new Map<
    string,
    { count: number; total: number }
  >();
  for (const t of activeTxs) {
    const key = txWibMonthKey(t.date);
    const cur = monthMap.get(key) ?? { count: 0, total: 0 };
    monthMap.set(key, { count: cur.count + 1, total: cur.total + Number(t.total) });
  }
  const months = Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, data]) => ({
      key,
      dbDate: key + "-01",
      label: monthLabel(key),
      locked: lockedSet.has(key + "-01"),
      ...data,
    }));

  // --- Agregasi metode bayar ---
  const methodMap = new Map<string, { count: number; total: number }>();
  for (const t of activeTxs) {
    for (const p of t.transaction_payments) {
      const cur = methodMap.get(p.method) ?? { count: 0, total: 0 };
      methodMap.set(p.method, { count: cur.count + 1, total: cur.total + Number(p.amount) });
    }
  }
  const methods = Array.from(methodMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([method, data]) => ({ method, ...data }));

  // --- Agregasi kategori/menu ---
  const categoryMap = new Map<string, { qty: number; total: number }>();
  const menuMap = new Map<string, { qty: number; total: number }>();
  for (const t of activeTxs) {
    for (const item of t.transaction_items) {
      const cat = item.category || "Lainnya";
      const curCat = categoryMap.get(cat) ?? { qty: 0, total: 0 };
      categoryMap.set(cat, {
        qty: curCat.qty + Number(item.qty),
        total: curCat.total + Number(item.qty) * Number(item.price),
      });
      const curMenu = menuMap.get(item.name) ?? { qty: 0, total: 0 };
      menuMap.set(item.name, {
        qty: curMenu.qty + Number(item.qty),
        total: curMenu.total + Number(item.qty) * Number(item.price),
      });
    }
  }
  const categories = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) => ({ name, ...data }));
  const menus = Array.from(menuMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15)
    .map(([name, data]) => ({ name, ...data }));

  const totalOmzet = activeTxs.reduce((s, t) => s + Number(t.total), 0);

  // Daftar bulan untuk filter dropdown
  const allMonthKeys = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-8">
      {/* Filter bulan */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-zinc-500">Filter bulan:</span>
        <div className="flex flex-wrap gap-2">
          <a
            href="?tab=rekap"
            className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
              !bulan
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Semua
          </a>
          {allMonthKeys.map((key) => (
            <a
              key={key}
              href={`?tab=rekap&bulan=${key}`}
              className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                bulan === key
                  ? "border-brand-300 bg-brand-50 text-brand-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {monthLabel(key)}
            </a>
          ))}
        </div>
      </div>

      {/* Ringkasan per bulan + Kunci */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Ringkasan per Bulan
        </p>
        <div className="space-y-2">
          {(bulan ? months.filter((m) => m.key === bulan) : months).map((m) => (
            <div
              key={m.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <LockMonthButton
                  businessId={businessId}
                  monthYear={m.dbDate}
                  locked={m.locked}
                  label={m.label}
                />
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{m.label}</p>
                  <p className="text-xs text-zinc-400">{m.count} transaksi ditandai</p>
                </div>
              </div>
              <p className="text-sm font-bold text-zinc-900">{formatRupiah(m.total)}</p>
            </div>
          ))}
        </div>
        {!bulan && (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-2">
            <p className="text-xs font-medium text-zinc-500">
              Total — {activeTxs.length} transaksi
            </p>
            <p className="text-sm font-bold text-zinc-900">{formatRupiah(totalOmzet)}</p>
          </div>
        )}
      </section>

      {/* Daftar transaksi */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Daftar Transaksi Ditandai{bulan ? ` — ${monthLabel(bulan)}` : ""}
          </p>
          <DownloadRekapButton
            txs={activeTxs}
            label={bulan ? monthLabel(bulan).replace(/\s/g, "-") : "semua"}
          />
        </div>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400">
                <th className="px-4 py-2.5 font-medium">Invoice</th>
                <th className="px-4 py-2.5 font-medium">Tanggal</th>
                <th className="px-4 py-2.5 font-medium">Metode</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {activeTxs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-400">
                    Tidak ada transaksi.
                  </td>
                </tr>
              ) : (
                activeTxs.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-zinc-900">{t.invoice_number}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{formatDate(t.date)}</td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {t.transaction_payments.map((p) => p.method).join(" + ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-zinc-900">
                      {formatRupiah(Number(t.total))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rekap metode bayar */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Rekap Metode Bayar
        </p>
        <div className="space-y-2">
          {methods.map((m) => (
            <div
              key={m.method}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium capitalize text-zinc-900">{m.method}</p>
                <p className="text-xs text-zinc-400">{m.count} transaksi</p>
              </div>
              <p className="text-sm font-semibold text-zinc-900">{formatRupiah(m.total)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Rekap kategori */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Rekap per Kategori
        </p>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400">
                <th className="px-4 py-2.5 font-medium">Kategori</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.name} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{c.name}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">{c.qty}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-zinc-900">
                    {formatRupiah(c.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top menu */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Menu Terlaris (dari transaksi ditandai)
        </p>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400">
                <th className="px-4 py-2.5 font-medium">Menu</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {menus.map((m) => (
                <tr key={m.name} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{m.name}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">{m.qty}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-zinc-900">
                    {formatRupiah(m.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
