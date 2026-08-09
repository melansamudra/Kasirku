import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function formatRupiah(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function MirrorPembelianPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: mirrorAccount } = await supabase
    .from("mirror_accounts")
    .select("id, permissions")
    .eq("business_id", businessId)
    .maybeSingle();

  if (!mirrorAccount) notFound();

  const service = createServiceClient();

  const p = (mirrorAccount.permissions ?? {}) as {
    show_purchases?: boolean;
    show_amount?: boolean;
  };

  if (!p.show_purchases) notFound();

  const { data: rows } = await service
    .from("purchases")
    .select("id, date, category, note, amount, paid_amount, suppliers(name)")
    .eq("business_id", businessId)
    .order("date", { ascending: false });

  type PurchaseRow = {
    id: string;
    date: string;
    category: string;
    note: string | null;
    amount: number;
    paid_amount: number;
    supplier_name: string | null;
  };

  const purchases: PurchaseRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    category: r.category,
    note: r.note,
    amount: Number(r.amount),
    paid_amount: Number(r.paid_amount),
    supplier_name: (r.suppliers as unknown as { name: string } | null)?.name ?? null,
  }));

  const totalPurchase = purchases.reduce((s, r) => s + r.amount, 0);
  const totalHutang = purchases.reduce((s, r) => s + Math.max(0, r.amount - r.paid_amount), 0);

  return (
    <div className="w-full">
      <h1 className="text-lg font-bold text-zinc-900">Pembelian & Hutang ({purchases.length})</h1>
      <p className="mt-1 text-sm text-zinc-500">Data pembelian toko</p>

      {purchases.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
          Belum ada data pembelian.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr className="text-left text-[10px] font-semibold uppercase text-zinc-400">
                  <th className="px-4 py-3">Supplier / Keterangan</th>
                  <th className="px-4 py-3">Tanggal</th>
                  {p.show_amount && (
                    <>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Sisa Hutang</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {purchases.map((r, i) => {
                  const hutang = r.amount - r.paid_amount;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-zinc-900">
                          {r.supplier_name ?? r.category}
                        </p>
                        {r.note && <p className="text-[11px] text-zinc-400">{r.note}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{formatDate(r.date)}</td>
                      {p.show_amount && (
                        <>
                          <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">
                            {formatRupiah(r.amount)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-medium">
                            {hutang > 0 ? (
                              <span className="text-red-500">{formatRupiah(hutang)}</span>
                            ) : (
                              <span className="text-brand-600">Lunas</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {p.show_amount && purchases.length > 1 && (
                <tfoot className="border-t border-zinc-200 bg-zinc-50">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-zinc-500">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">
                      {formatRupiah(totalPurchase)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-red-500">
                      {formatRupiah(totalHutang)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
