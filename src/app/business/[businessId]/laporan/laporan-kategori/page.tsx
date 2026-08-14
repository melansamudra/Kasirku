import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchAllRows } from "@/lib/pagination";
import {
  PERIOD_COOKIE_NAME,
  getPeriodRange,
  parsePeriod,
} from "../../(dashboard)/reports/period";
import PeriodTabs from "../../(dashboard)/reports/period-tabs";

function fmt(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

export default async function MirrorLaporanKategoriPage({
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: mirrorAccount }, { data: biz }] = await Promise.all([
    supabase.from("mirror_accounts").select("id, permissions").eq("business_id", businessId).maybeSingle(),
    supabase.from("businesses").select("owner_id").eq("id", businessId).maybeSingle(),
  ]);
  const isOwner = biz?.owner_id === user.id;
  if (!mirrorAccount && !isOwner) notFound();

  const service = createServiceClient();

  const p = isOwner
    ? { show_items: true, show_amount: true }
    : (mirrorAccount!.permissions ?? {}) as { show_items?: boolean; show_amount?: boolean };

  if (!p.show_items) notFound();

  const basePath = `/business/${businessId}/laporan/laporan-kategori`;

  type MirrorRow = {
    transactions: {
      date: string;
      voided: boolean;
      transaction_items: { name: string; category: string | null; qty: number; price: number; voided: boolean }[] | null;
    } | null;
  };

  const rows = await fetchAllRows<MirrorRow>((from, to) =>
    service
      .from("mirror_visible_transactions")
      .select(
        `transactions!mirror_visible_transactions_transaction_id_fkey(
          date, voided,
          transaction_items(name, category, qty, price, voided)
        )`,
      )
      .eq("business_id", businessId)
      .range(from, to),
  );

  // Agregasi per kategori → per nama menu
  type MenuEntry = { qty: number; revenue: number };
  type KategoriEntry = { qty: number; revenue: number; menus: Map<string, MenuEntry> };

  const kategoriMap = new Map<string, KategoriEntry>();

  for (const row of rows) {
    const t = row.transactions;
    if (!t || t.voided) continue;
    if (fromIso && t.date < fromIso) continue;
    if (toIsoExclusive && t.date >= toIsoExclusive) continue;

    for (const item of t.transaction_items ?? []) {
      if (item.voided) continue;
      const kat = item.category?.trim() || "Tanpa Kategori";
      const qty = Number(item.qty);
      const revenue = qty * Number(item.price);

      let katEntry = kategoriMap.get(kat);
      if (!katEntry) {
        katEntry = { qty: 0, revenue: 0, menus: new Map() };
        kategoriMap.set(kat, katEntry);
      }
      katEntry.qty += qty;
      katEntry.revenue += revenue;

      const menuEntry = katEntry.menus.get(item.name);
      if (menuEntry) {
        menuEntry.qty += qty;
        menuEntry.revenue += revenue;
      } else {
        katEntry.menus.set(item.name, { qty, revenue });
      }
    }
  }

  const kategoriList = Array.from(kategoriMap.entries())
    .map(([kat, entry]) => ({
      kat,
      qty: entry.qty,
      revenue: entry.revenue,
      menus: Array.from(entry.menus.entries())
        .map(([name, m]) => ({ name, qty: m.qty, revenue: m.revenue }))
        .sort((a, b) => b.qty - a.qty),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalQty = kategoriList.reduce((s, k) => s + k.qty, 0);
  const totalRevenue = kategoriList.reduce((s, k) => s + k.revenue, 0);

  function fmtQty(q: number) {
    return q % 1 === 0 ? String(q) : q.toFixed(1);
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan per Kategori Menu</h1>
        <PeriodTabs basePath={basePath} period={period} />
      </div>

      {period === "custom" && (
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-medium text-zinc-600">
            Dari
            <input type="date" name="from" defaultValue={from}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Sampai
            <input type="date" name="to" defaultValue={to}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
            Terapkan
          </button>
        </form>
      )}

      {kategoriList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada data untuk periode ini.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {kategoriList.map((k) => (
            <div key={k.kat} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {/* Header kategori */}
              <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
                <p className="text-xs font-bold text-zinc-700 uppercase tracking-wide">{k.kat}</p>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-zinc-500">{fmtQty(k.qty)} item</span>
                  {p.show_amount && (
                    <span className="text-xs font-semibold text-zinc-900">{fmt(k.revenue)}</span>
                  )}
                </div>
              </div>
              {/* Detail menu per kategori */}
              <table className="w-full text-sm">
                <tbody>
                  {k.menus.map((m, i) => (
                    <tr key={m.name}
                      className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/30"}`}>
                      <td className="px-4 py-2.5 text-xs text-zinc-700">{m.name}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-zinc-600">
                        {fmtQty(m.qty)}×
                      </td>
                      {p.show_amount && (
                        <td className="px-4 py-2.5 text-right text-xs font-medium text-zinc-800">
                          {fmt(m.revenue)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* Footer total */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-xs font-bold text-zinc-700">Total Semua Kategori</p>
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold text-zinc-700">{fmtQty(totalQty)} item</span>
              {p.show_amount && (
                <span className="text-sm font-bold text-zinc-900">{fmt(totalRevenue)}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
