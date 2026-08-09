import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import DateRangeFilter from "../date-range-filter";

function formatRupiah(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

function formatJam(hour: number) {
  const h = hour.toString().padStart(2, "0");
  const h2 = ((hour + 1) % 24).toString().padStart(2, "0");
  return `${h}:00 – ${h2}:00`;
}

export default async function MirrorLaporanJamPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { from, to } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();

  const { data: mirrorAccount } = await service
    .from("mirror_accounts")
    .select("id, permissions")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  let isOwner = false;
  if (!mirrorAccount) {
    const { data: biz } = await service.from("businesses").select("owner_id").eq("id", businessId).single();
    isOwner = biz?.owner_id === user.id;
  }
  if (!mirrorAccount && !isOwner) notFound();

  const p = isOwner
    ? { show_transactions: true, show_amount: true }
    : (mirrorAccount!.permissions ?? {}) as { show_transactions?: boolean; show_amount?: boolean };

  if (!p.show_transactions) notFound();

  const { data: rows } = await service
    .from("mirror_visible_transactions")
    .select(
      `transactions!mirror_visible_transactions_transaction_id_fkey(
        date, total
      )`,
    )
    .eq("business_id", businessId);

  // Agregasi per jam (WIB = UTC+7)
  const hourMap = new Map<number, { count: number; revenue: number }>();
  for (let h = 0; h < 24; h++) hourMap.set(h, { count: 0, revenue: 0 });

  for (const row of rows ?? []) {
    const tx = row.transactions as unknown as {
      date: string;
      total: number;
    } | null;
    if (!tx) continue;

    const dateWib = new Date(new Date(tx.date).getTime() + 7 * 60 * 60 * 1000);
    const dateStr = dateWib.toISOString().slice(0, 10); // YYYY-MM-DD

    if (from && dateStr < from) continue;
    if (to && dateStr > to) continue;

    const hour = dateWib.getUTCHours();
    const entry = hourMap.get(hour)!;
    entry.count += 1;
    entry.revenue += Number(tx.total);
  }

  // Hanya tampilkan jam yang ada transaksi
  const hourList = Array.from(hourMap.entries())
    .filter(([, v]) => v.count > 0)
    .map(([hour, { count, revenue }]) => ({ hour, count, revenue }))
    .sort((a, b) => a.hour - b.hour);

  const totalCount = hourList.reduce((s, h) => s + h.count, 0);
  const totalRevenue = hourList.reduce((s, h) => s + h.revenue, 0);

  // Jam tersibuk
  const busiestHour = hourList.length > 0
    ? hourList.reduce((max, h) => (h.count > max.count ? h : max), hourList[0])
    : null;

  return (
    <div className="w-full">
      <h1 className="text-lg font-bold text-zinc-900">Laporan Penjualan per Jam</h1>

      <div className="mt-4">
        <DateRangeFilter from={from} to={to} />
      </div>

      {hourList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
          Belum ada data transaksi untuk periode ini.
        </div>
      ) : (
        <>
          {busiestHour && (
            <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
              <p className="text-xs text-brand-700">
                <span className="font-semibold">Jam tersibuk:</span>{" "}
                {formatJam(busiestHour.hour)} — {busiestHour.count} transaksi
                {p.show_amount ? ` · ${formatRupiah(busiestHour.revenue)}` : ""}
              </p>
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr className="text-left text-[10px] font-semibold uppercase text-zinc-400">
                    <th className="px-4 py-3">Jam (WIB)</th>
                    <th className="px-4 py-3 text-right">Transaksi</th>
                    {p.show_amount && (
                      <th className="px-4 py-3 text-right">Pendapatan</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {hourList.map((h, i) => {
                    const isBusiest = busiestHour?.hour === h.hour;
                    return (
                      <tr
                        key={h.hour}
                        className={`border-b border-zinc-50 last:border-0 ${
                          isBusiest ? "bg-brand-50/60" : i % 2 === 0 ? "" : "bg-zinc-50/40"
                        }`}
                      >
                        <td className="px-4 py-3 text-xs text-zinc-700">
                          {formatJam(h.hour)}
                          {isBusiest && (
                            <span className="ml-2 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                              Tersibuk
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-medium text-zinc-800">
                          {h.count}
                        </td>
                        {p.show_amount && (
                          <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">
                            {formatRupiah(h.revenue)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-zinc-200 bg-zinc-50">
                  <tr>
                    <td className="px-4 py-3 text-xs font-semibold text-zinc-500">Total</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-900">
                      {totalCount}
                    </td>
                    {p.show_amount && (
                      <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">
                        {formatRupiah(totalRevenue)}
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
