import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import DateRangeFilter from "../date-range-filter";

function formatRupiah(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

export default async function MirrorLaporanMenuPage({
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
    ? { show_items: true, show_amount: true }
    : (mirrorAccount!.permissions ?? {}) as { show_items?: boolean; show_amount?: boolean };

  if (!p.show_items) notFound();

  // Ambil transaksi yang dipilih owner beserta item-nya
  let query = service
    .from("mirror_visible_transactions")
    .select(
      `transactions!mirror_visible_transactions_transaction_id_fkey(
        date,
        transaction_items(name, qty, price)
      )`,
    )
    .eq("business_id", businessId);

  if (from) {
    query = query.gte("transactions.date", `${from}T00:00:00+07:00`);
  }
  if (to) {
    query = query.lte("transactions.date", `${to}T23:59:59+07:00`);
  }

  const { data: rows } = await query;

  // Agregasi per nama menu
  const menuMap = new Map<string, { qty: number; revenue: number }>();

  for (const row of rows ?? []) {
    const tx = row.transactions as unknown as {
      date: string;
      transaction_items: { name: string; qty: number; price: number }[] | null;
    } | null;
    if (!tx) continue;

    // Filter tanggal manual karena nested filter Supabase tidak selalu reliable
    if (from && tx.date < `${from}T00:00:00`) continue;
    if (to && tx.date > `${to}T23:59:59`) continue;

    for (const item of tx.transaction_items ?? []) {
      const name = item.name ?? "—";
      const qty = Number(item.qty);
      const revenue = qty * Number(item.price);
      const existing = menuMap.get(name);
      if (existing) {
        existing.qty += qty;
        existing.revenue += revenue;
      } else {
        menuMap.set(name, { qty, revenue });
      }
    }
  }

  const menuList = Array.from(menuMap.entries())
    .map(([name, { qty, revenue }]) => ({ name, qty, revenue }))
    .sort((a, b) => b.qty - a.qty);

  const totalQty = menuList.reduce((s, m) => s + m.qty, 0);
  const totalRevenue = menuList.reduce((s, m) => s + m.revenue, 0);

  return (
    <div className="w-full">
      <h1 className="text-lg font-bold text-zinc-900">Laporan Penjualan per Menu</h1>

      <div className="mt-4">
        <DateRangeFilter from={from} to={to} />
      </div>

      {menuList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
          Belum ada data item untuk periode ini.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr className="text-left text-[10px] font-semibold uppercase text-zinc-400">
                  <th className="px-4 py-3">Menu</th>
                  <th className="px-4 py-3 text-right">Qty Terjual</th>
                  {p.show_amount && (
                    <th className="px-4 py-3 text-right">Pendapatan</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {menuList.map((m, i) => (
                  <tr
                    key={m.name}
                    className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                  >
                    <td className="px-4 py-3 text-xs font-medium text-zinc-800">{m.name}</td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-700">
                      {m.qty % 1 === 0 ? m.qty : m.qty.toFixed(2)}
                    </td>
                    {p.show_amount && (
                      <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">
                        {formatRupiah(m.revenue)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-zinc-200 bg-zinc-50">
                <tr>
                  <td className="px-4 py-3 text-xs font-semibold text-zinc-500">Total</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-zinc-900">
                    {totalQty % 1 === 0 ? totalQty : totalQty.toFixed(2)}
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
      )}
    </div>
  );
}
