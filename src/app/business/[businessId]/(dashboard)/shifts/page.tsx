import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import DeleteShiftButton from "./delete-shift-button";
import PrintShiftButton from "./print-shift-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ShiftRow = {
  id: string;
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  closing_cash: number;
  cash_sales: number;
  non_cash_sales: number;
  total_sales: number;
  expected_cash: number;
  difference: number;
  tx_count: number;
  void_count: number;
  close_notes: string | null;
  cashiers: { name: string } | null;
};

export default async function ShiftsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase.from("businesses").select("id, name, owner_id").eq("id", businessId).single(),
    supabase.auth.getUser(),
  ]);

  if (!business) {
    notFound();
  }

  const isOwner = business.owner_id === userData.user?.id;

  const today = todayWibDateString();
  const todayStart = `${today}T00:00:00+07:00`;

  // Shift aktif (belum ditutup)
  const { data: activeShiftRaw } = await supabase
    .from("shifts")
    .select("id, opened_at, opening_cash, cashiers(name)")
    .eq("business_id", businessId)
    .is("closed_at", null)
    .maybeSingle();

  // Live stats & transaksi terbaru dalam shift aktif
  const activeShiftTx = activeShiftRaw
    ? await supabase
        .from("transactions")
        .select("id, invoice_number, total, date, voided, transaction_payments(method, amount)")
        .eq("shift_id", activeShiftRaw.id)
        .order("date", { ascending: false })
        .limit(20)
        .then((r) => (r.data ?? []))
    : [];

  const activeNonVoided = activeShiftTx.filter((t) => !t.voided);
  const activeTotalSales = activeNonVoided.reduce((s, t) => s + Number(t.total), 0);
  const activeTxCount = activeNonVoided.length;
  const activeCashSales = activeNonVoided.reduce(
    (s, t) => s + t.transaction_payments.filter((p) => p.method === "Tunai").reduce((a, p) => a + Number(p.amount), 0),
    0,
  );
  const activeNonCashSales = activeNonVoided.reduce(
    (s, t) => s + t.transaction_payments.filter((p) => p.method !== "Tunai").reduce((a, p) => a + Number(p.amount), 0),
    0,
  );
  const activeExpectedCash = Number(activeShiftRaw?.opening_cash ?? 0) + activeCashSales;

  let shiftQuery = supabase
    .from("shifts")
    .select(
      "id, opened_at, closed_at, opening_cash, closing_cash, cash_sales, non_cash_sales, total_sales, expected_cash, difference, tx_count, void_count, close_notes, cashiers(name)",
    )
    .eq("business_id", businessId)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(50);

  // Staf hanya melihat shift hari ini
  if (!isOwner) shiftQuery = shiftQuery.gte("opened_at", todayStart);

  const { data: shiftRows } = await shiftQuery;

  const shifts = (shiftRows ?? []) as unknown as ShiftRow[];

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">
          Riwayat Shift — {business.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {isOwner ? "50 shift terakhir yang sudah ditutup." : "Shift hari ini."}
        </p>

        {/* ── Shift aktif ── */}
        {activeShiftRaw && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Shift berjalan
                </span>
                <p className="mt-1 text-sm font-medium text-zinc-900">
                  {(activeShiftRaw.cashiers as unknown as { name: string } | null)?.name ?? "Kasir"}{" "}
                  <span className="font-normal text-zinc-500">· buka {formatDateTime(activeShiftRaw.opened_at)}</span>
                </p>
              </div>
              <PrintShiftButton businessId={businessId} shiftId={activeShiftRaw.id} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Total penjualan", value: formatRupiah(activeTotalSales), accent: true },
                { label: "Transaksi", value: String(activeTxCount) },
                { label: "Tunai", value: formatRupiah(activeCashSales) },
                { label: "Non-tunai", value: formatRupiah(activeNonCashSales) },
              ].map((card) => (
                <div key={card.label} className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                  <p className="text-[11px] text-zinc-500">{card.label}</p>
                  <p className={`mt-0.5 text-base font-semibold ${card.accent ? "text-emerald-600" : "text-zinc-900"}`}>
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[11px] text-zinc-500">Modal awal</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-900">{formatRupiah(Number(activeShiftRaw.opening_cash))}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[11px] text-zinc-500">Kas diharapkan di laci</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-900">{formatRupiah(activeExpectedCash)}</p>
              </div>
            </div>

            {activeNonVoided.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-lg border border-emerald-100 bg-white">
                <p className="border-b border-zinc-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Transaksi terbaru
                </p>
                {activeNonVoided.slice(0, 10).map((tx) => {
                  const method = tx.transaction_payments[0]?.method ?? "—";
                  return (
                    <div key={tx.id} className="flex items-center gap-2 border-b border-zinc-50 px-3 py-2 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium text-zinc-800">{tx.invoice_number}</p>
                        <p className="text-[11px] text-zinc-400">{formatDateTime(tx.date)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{method}</span>
                      <p className="shrink-0 text-xs font-semibold text-zinc-900">{formatRupiah(Number(tx.total))}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {activeNonVoided.length === 0 && (
              <p className="mt-3 text-center text-xs text-emerald-600/70">Belum ada transaksi dalam shift ini.</p>
            )}
          </div>
        )}

        {/* ── Shift sudah ditutup ── */}
        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {activeShiftRaw ? "Shift sebelumnya" : (isOwner ? "50 shift terakhir" : "Shift hari ini")}
        </p>
        <div className="mt-2 space-y-2">
          {shifts.length > 0 ? (
            shifts.map((s) => {
              const diff = Number(s.difference);
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-900">
                      {s.cashiers?.name ?? "Kasir terhapus"}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900">
                        {formatRupiah(Number(s.total_sales))}
                      </p>
                      <PrintShiftButton businessId={businessId} shiftId={s.id} />
                      {isOwner && (
                        <DeleteShiftButton
                          businessId={businessId}
                          shiftId={s.id}
                          label={formatDateTime(s.opened_at)}
                        />
                      )}
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatDateTime(s.opened_at)} – {formatDateTime(s.closed_at)}
                  </p>

                  <details className="group mt-1.5">
                    <summary className="cursor-pointer list-none text-[11px] font-medium text-brand-600 hover:text-brand-700 [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Lihat detail ▾</span>
                      <span className="hidden group-open:inline">Sembunyikan detail ▴</span>
                    </summary>

                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      <span>Modal Awal</span>
                      <span className="text-right font-medium text-zinc-900">{formatRupiah(Number(s.opening_cash))}</span>
                      {Number(s.cash_sales) > 0 && (
                        <>
                          <span>Tunai</span>
                          <span className="text-right font-medium text-zinc-900">{formatRupiah(Number(s.cash_sales))}</span>
                        </>
                      )}
                      {Number(s.non_cash_sales) > 0 && (
                        <>
                          <span>Non-Tunai</span>
                          <span className="text-right font-medium text-zinc-900">{formatRupiah(Number(s.non_cash_sales))}</span>
                        </>
                      )}
                      <span>Transaksi</span>
                      <span className="text-right font-medium text-zinc-900">{s.tx_count}</span>
                      <span>Kas Diharapkan</span>
                      <span className="text-right font-medium text-zinc-900">{formatRupiah(Number(s.expected_cash))}</span>
                      <span>Selisih</span>
                      <span className={`text-right font-semibold ${diff === 0 ? "text-zinc-900" : diff > 0 ? "text-brand-700" : "text-red-600"}`}>
                        {diff === 0 ? "Pas" : `${diff > 0 ? "+" : ""}${formatRupiah(diff)}`}
                      </span>
                    </div>

                    {isOwner && s.void_count > 0 && (
                      <p className="mt-1.5 text-[11px] text-red-500">
                        {s.void_count} transaksi dibatalkan
                      </p>
                    )}
                    {s.close_notes && (
                      <p className="mt-1.5 text-[11px] text-zinc-400">Catatan: {s.close_notes}</p>
                    )}
                  </details>
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada shift yang ditutup.
            </p>
          )}
        </div>
    </div>
  );
}
