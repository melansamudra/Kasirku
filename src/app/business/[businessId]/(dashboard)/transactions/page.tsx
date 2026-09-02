import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import { fetchAllRows } from "@/lib/pagination";
import { importTransactions, previewMokaImport, importFromMoka } from "./actions";
import { importSalesRecap } from "./rekap-actions";
import { TransactionActions } from "./transaction-actions";
import MirrorToggle from "./mirror-toggle";
import MirrorHint from "./mirror-hint";
import DateFilter from "./date-filter";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
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

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { businessId } = await params;
  const { date: dateParam } = await searchParams;
  const supabase = await createClient();

  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, owner_id, mirroring_enabled, cost_control_enabled, stock_locations_enabled")
      .eq("id", businessId)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!business) {
    notFound();
  }

  const isOwner = business.owner_id === userData.user?.id;
  const showMirrorToggle = isOwner && !!business.mirroring_enabled;

  const today = todayWibDateString();
  const selectedDate = isOwner ? (dateParam ?? today) : today;
  const dayStart = `${selectedDate}T00:00:00+07:00`;
  const nextDay = new Date(new Date(dayStart).getTime() + 86400000);
  const dayEnd = nextDay.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) + "T00:00:00+07:00";

  const query = supabase
    .from("transactions")
    .select(
      "id, invoice_number, receipt_code, date, total, voided, order_label, customer_name, catatan, cashiers!transactions_cashier_id_fkey(name), transaction_payments(method)",
    )
    .eq("business_id", businessId)
    .gte("date", dayStart)
    .lt("date", dayEnd)
    .order("date", { ascending: false });

  // Staf tidak melihat transaksi yang dibatalkan
  if (!isOwner) {
    query.eq("voided", false);
  }

  const [{ data: transactions }, visibleRows, { data: lockRows }] = await Promise.all([
    query,
    showMirrorToggle
      ? fetchAllRows<{ transaction_id: string }>((from, to) =>
          supabase
            .from("mirror_visible_transactions")
            .select("transaction_id")
            .eq("business_id", businessId)
            .range(from, to),
        )
      : Promise.resolve([]),
    showMirrorToggle
      ? supabase
          .from("mirror_month_locks")
          .select("month_year")
          .eq("business_id", businessId)
      : Promise.resolve({ data: null }),
  ]);

  const visibleIds = new Set(visibleRows.map((r) => r.transaction_id));
  const lockedMonths = new Set((lockRows ?? []).map((r) => r.month_year as string));

  function txLockedMonth(dateStr: string): boolean {
    const monthKey = new Date(dateStr).toLocaleDateString("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
    }).slice(0, 7) + "-01";
    return lockedMonths.has(monthKey);
  }

  const boundImportTransactions = importTransactions.bind(null, businessId);
  const boundImportRekap = importSalesRecap.bind(null, businessId);
  const boundPreviewMoka = previewMokaImport.bind(null, businessId);
  const boundImportMoka = importFromMoka.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">
            {business.cost_control_enabled ? "Penjualan" : "Riwayat Transaksi"} — {business.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isOwner ? `Transaksi tanggal ${new Date(dayStart).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}.` : "Transaksi hari ini."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && <DateFilter currentDate={selectedDate} />}
          {isOwner && (
            <TransactionActions
              businessId={businessId}
              importAction={boundImportTransactions}
              importRekapAction={boundImportRekap}
              previewMokaAction={boundPreviewMoka}
              importMokaAction={boundImportMoka}
              costControlEnabled={business.cost_control_enabled}
              stockLocationsEnabled={business.stock_locations_enabled}
            />
          )}
        </div>
      </div>

      {showMirrorToggle && <MirrorHint />}

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
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-zinc-900">{t.invoice_number}</p>
                    {(t as unknown as { receipt_code?: string | null }).receipt_code && (
                      <span className="rounded bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                        {(t as unknown as { receipt_code: string }).receipt_code}
                      </span>
                    )}
                    {(t as unknown as { order_label?: string | null }).order_label && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600">
                        {(t as unknown as { order_label: string }).order_label}
                      </span>
                    )}
                  </div>
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
                  {(t as unknown as { customer_name?: string | null }).customer_name && (
                    <> · {(t as unknown as { customer_name: string }).customer_name}</>
                  )}
                </p>
                {(t as unknown as { catatan?: string | null }).catatan && (
                  <p className="mt-0.5 text-[11px] text-zinc-400 line-clamp-1">
                    {(t as unknown as { catatan: string }).catatan}
                  </p>
                )}
              </Link>
              {showMirrorToggle && (
                <MirrorToggle
                  businessId={businessId}
                  transactionId={t.id}
                  visible={visibleIds.has(t.id)}
                  locked={txLockedMonth(t.date)}
                />
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
