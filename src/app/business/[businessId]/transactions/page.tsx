import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TransactionsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: transactions } = await supabase
    .from("transactions")
    .select(
      "id, invoice_number, date, total, voided, cashiers!transactions_cashier_id_fkey(name), transaction_payments(method)",
    )
    .eq("business_id", businessId)
    .order("date", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/dashboard" className="text-xs font-medium text-zinc-500 hover:underline">
          ← Kembali ke dashboard
        </Link>

        <h1 className="mt-3 text-lg font-bold text-zinc-900">
          Riwayat Transaksi — {business.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">50 transaksi terbaru.</p>

        <div className="mt-6 space-y-2">
          {transactions && transactions.length > 0 ? (
            transactions.map((t) => (
              <Link
                key={t.id}
                href={`/business/${businessId}/transactions/${t.id}`}
                className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-brand-300"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-zinc-900">{t.invoice_number}</p>
                  {t.voided ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                      Dibatalkan
                    </span>
                  ) : (
                    <p className="text-sm font-semibold text-zinc-900">
                      {formatRupiah(Number(t.total))}
                    </p>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatDateTime(t.date)} ·{" "}
                  {(t.cashiers as unknown as { name: string } | null)?.name ?? "—"} ·{" "}
                  {t.transaction_payments?.[0]?.method ?? "—"}
                </p>
              </Link>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada transaksi.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
