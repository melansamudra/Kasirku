import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function formatRupiah(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MirrorTransaksiPage({
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

  const service = createServiceClient();

  const { data: mirrorAccount } = await service
    .from("mirror_accounts")
    .select("id, permissions")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!mirrorAccount) notFound();

  const p = (mirrorAccount.permissions ?? {}) as {
    show_transactions?: boolean;
    show_amount?: boolean;
    show_cashier?: boolean;
    show_customer?: boolean;
  };

  if (!p.show_transactions) notFound();

  const { data: rows } = await service
    .from("mirror_visible_transactions")
    .select(
      "transaction_id, transactions!mirror_visible_transactions_transaction_id_fkey(id, invoice_number, date, total, cashiers!transactions_cashier_id_fkey(name), customers!transactions_customer_id_fkey(name))",
    )
    .eq("business_id", businessId)
    .order("transaction_id", { ascending: false });

  type TxRow = {
    id: string;
    invoice_number: string;
    date: string;
    total: number;
    cashier_name: string | null;
    customer_name: string | null;
  };

  const transactions: TxRow[] = (rows ?? [])
    .map((row) => {
      const t = row.transactions as unknown as {
        id: string;
        invoice_number: string;
        date: string;
        total: number;
        cashiers: { name: string } | null;
        customers: { name: string } | null;
      } | null;
      if (!t) return null;
      return {
        id: t.id,
        invoice_number: t.invoice_number,
        date: t.date,
        total: Number(t.total),
        cashier_name: (t.cashiers as { name: string } | null)?.name ?? null,
        customer_name: (t.customers as { name: string } | null)?.name ?? null,
      };
    })
    .filter(Boolean) as TxRow[];

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalTx = transactions.reduce((s, t) => s + t.total, 0);
  const colSpan = 1 + (p.show_cashier ? 1 : 0) + (p.show_customer ? 1 : 0);

  return (
    <div className="w-full">
      <h1 className="text-lg font-bold text-zinc-900">
        Riwayat Transaksi ({transactions.length})
      </h1>
      <p className="mt-1 text-sm text-zinc-500">Transaksi yang dibagikan oleh pemilik toko</p>

      {transactions.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
          Belum ada transaksi yang dibagikan.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr className="text-left text-[10px] font-semibold uppercase text-zinc-400">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Tanggal</th>
                  {p.show_cashier && <th className="px-4 py-3">Kasir</th>}
                  {p.show_customer && <th className="px-4 py-3">Pelanggan</th>}
                  {p.show_amount && <th className="px-4 py-3 text-right">Total</th>}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                  >
                    <td className="px-4 py-3 text-xs font-semibold text-zinc-900">
                      {t.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{formatDateTime(t.date)}</td>
                    {p.show_cashier && (
                      <td className="px-4 py-3 text-xs text-zinc-500">{t.cashier_name ?? "—"}</td>
                    )}
                    {p.show_customer && (
                      <td className="px-4 py-3 text-xs text-zinc-500">{t.customer_name ?? "—"}</td>
                    )}
                    {p.show_amount && (
                      <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">
                        {formatRupiah(t.total)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {p.show_amount && transactions.length > 1 && (
                <tfoot className="border-t border-zinc-200 bg-zinc-50">
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="px-4 py-3 text-xs font-semibold text-zinc-500"
                    >
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">
                      {formatRupiah(totalTx)}
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
