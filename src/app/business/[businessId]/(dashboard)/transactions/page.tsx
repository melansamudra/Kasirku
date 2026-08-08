import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { importTransactions } from "./actions";
import { TransactionActions } from "./transaction-actions";
import MirrorToggle from "./mirror-toggle";

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

  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, owner_id, mirroring_enabled")
      .eq("id", businessId)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!business) {
    notFound();
  }

  const isOwner = business.owner_id === userData.user?.id;
  const showMirrorToggle = isOwner && !!business.mirroring_enabled;

  const query = supabase
    .from("transactions")
    .select(
      "id, invoice_number, date, total, voided, cashiers!transactions_cashier_id_fkey(name), transaction_payments(method)",
    )
    .eq("business_id", businessId)
    .order("date", { ascending: false })
    .limit(50);

  // Non-owner tidak perlu lihat transaksi yang dibatalkan
  if (!isOwner) query.eq("voided", false);

  const [{ data: transactions }, { data: visibleRows }] = await Promise.all([
    query,
    showMirrorToggle
      ? supabase
          .from("mirror_visible_transactions")
          .select("transaction_id")
          .eq("business_id", businessId)
      : Promise.resolve({ data: null }),
  ]);

  const visibleIds = new Set((visibleRows ?? []).map((r) => r.transaction_id as string));

  const boundImportTransactions = importTransactions.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">
            Riwayat Transaksi — {business.name}
          </h1>
          {isOwner && <p className="mt-1 text-sm text-zinc-500">50 transaksi terbaru.</p>}
        </div>
        {isOwner && (
          <TransactionActions businessId={businessId} importAction={boundImportTransactions} />
        )}
      </div>

      {showMirrorToggle && (
        <p className="mt-2 text-xs text-zinc-400">
          Ikon <span className="font-medium text-brand-600">👁</span> di setiap transaksi mengontrol visibilitas di akun mirror.
        </p>
      )}

      <div className="mt-6 space-y-2">
        {transactions && transactions.length > 0 ? (
          transactions.map((t) => (
            <div
              key={t.id}
              className="flex items-stretch overflow-hidden rounded-xl border border-zinc-200 bg-white transition-colors hover:border-brand-300"
            >
              <Link
                href={`/business/${businessId}/transactions/${t.id}`}
                className="flex-1 px-4 py-3"
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
                  {(t.transaction_payments as { method: string }[] | null)
                    ?.map((p) => p.method)
                    .join(" + ") || "—"}
                </p>
              </Link>
              {showMirrorToggle && (
                <div className="flex items-center border-l border-zinc-100 px-3">
                  <MirrorToggle
                    businessId={businessId}
                    transactionId={t.id}
                    visible={visibleIds.has(t.id)}
                  />
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada transaksi.
          </p>
        )}
      </div>
    </div>
  );
}
