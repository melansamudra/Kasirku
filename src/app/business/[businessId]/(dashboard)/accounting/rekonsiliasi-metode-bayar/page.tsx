import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { todayWibDateString } from "@/lib/wib";
import { createPaymentReconciliation } from "./actions";
import PaymentReconciliationForm from "./form";

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function addDaysStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function RekonsiliasiMetodeBayarPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ method?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { method: methodParam, from: fromParam, to: toParam } = await searchParams;

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  // Daftar metode bayar yang pernah dipakai bisnis ini (bukan hardcode --
  // supaya metode custom yang dipakai owner tetap muncul).
  const paymentRows = await fetchAllRows<{ method: string }>((from, to) =>
    supabase
      .from("transaction_payments")
      .select("method, transactions!inner(business_id)")
      .eq("transactions.business_id", businessId)
      .range(from, to),
  );
  const methods = Array.from(new Set(paymentRows.map((r) => r.method))).sort();

  const today = todayWibDateString();
  const selectedMethod = methodParam && methods.includes(methodParam) ? methodParam : methods[0];
  const periodEnd = /^\d{4}-\d{2}-\d{2}$/.test(toParam ?? "") ? (toParam as string) : today;
  const periodStart = /^\d{4}-\d{2}-\d{2}$/.test(fromParam ?? "")
    ? (fromParam as string)
    : addDaysStr(periodEnd, -6);

  let expectedAmount = 0;
  if (selectedMethod) {
    const rows = await fetchAllRows<{ amount: number }>((from, to) =>
      supabase
        .from("transaction_payments")
        .select("amount, transactions!inner(voided, date, business_id)")
        .eq("method", selectedMethod)
        .eq("transactions.business_id", businessId)
        .eq("transactions.voided", false)
        .gte("transactions.date", `${periodStart}T00:00:00+07:00`)
        .lte("transactions.date", `${periodEnd}T23:59:59+07:00`)
        .range(from, to),
    );
    expectedAmount = rows.reduce((s, r) => s + Number(r.amount), 0);
  }

  const { data: history } = await supabase
    .from("payment_reconciliations")
    .select("id, payment_method, period_start, period_end, expected_amount, received_amount, difference, note, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(15);

  const boundCreate = createPaymentReconciliation.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Rekonsiliasi Metode Bayar — {business.name}</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Cocokkan nominal per metode bayar (dari sistem) dengan yang benar-benar diterima di rekening —
          selisihnya (mis. potongan admin QRIS/EDC) otomatis tercatat sebagai beban.
        </p>
      </div>

      {methods.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-200 px-4 py-10 text-center text-xs text-zinc-400">
          Belum ada transaksi tercatat untuk bisnis ini.
        </p>
      ) : (
        <>
          <form method="get" className="mt-6 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-4">
            <label className="text-xs font-medium text-zinc-600">
              Metode Bayar
              <select
                name="method"
                defaultValue={selectedMethod}
                className="mt-1 block rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
              >
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-zinc-600">
              Dari
              <input
                type="date"
                name="from"
                defaultValue={periodStart}
                className="mt-1 block rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
              />
            </label>
            <label className="text-xs font-medium text-zinc-600">
              Sampai
              <input
                type="date"
                name="to"
                defaultValue={periodEnd}
                className="mt-1 block rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Tampilkan
            </button>
          </form>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-xs text-zinc-500">
              Total {selectedMethod} Menurut Sistem ({formatDate(periodStart)} – {formatDate(periodEnd)})
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{formatRupiah(expectedAmount)}</p>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900">Catat Rekonsiliasi</h2>
            <PaymentReconciliationForm
              action={boundCreate}
              paymentMethod={selectedMethod}
              periodStart={periodStart}
              periodEnd={periodEnd}
              expectedAmount={expectedAmount}
            />
          </div>
        </>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Rekonsiliasi</h2>
        </div>
        <div className="divide-y divide-zinc-50 px-4">
          {(history ?? []).length === 0 && (
            <p className="py-6 text-center text-xs text-zinc-300">Belum ada rekonsiliasi tersimpan.</p>
          )}
          {(history ?? []).map((h) => (
            <div key={h.id} className="py-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-700">
                  {h.payment_method} · {formatDate(h.period_start)} – {formatDate(h.period_end)}
                </span>
                <span
                  className={
                    Math.abs(Number(h.difference)) < 1
                      ? "font-semibold text-brand-700"
                      : Number(h.difference) > 0
                        ? "font-semibold text-red-600"
                        : "font-semibold text-amber-600"
                  }
                >
                  {Math.abs(Number(h.difference)) < 1
                    ? "✓ Cocok"
                    : Number(h.difference) > 0
                      ? `Selisih ${formatRupiah(Number(h.difference))} (dicatat beban)`
                      : `Diterima lebih ${formatRupiah(Math.abs(Number(h.difference)))}`}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-zinc-400">
                <span>
                  Sistem {formatRupiah(Number(h.expected_amount))} vs Diterima {formatRupiah(Number(h.received_amount))}
                </span>
              </div>
              {h.note && <p className="mt-0.5 text-[11px] text-zinc-400">{h.note}</p>}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Untuk rekonsiliasi saldo kas/bank secara keseluruhan (bukan per metode bayar), lihat{" "}
        <Link href={`/business/${businessId}/accounting/rekonsiliasi`} className="text-brand-600 hover:underline">
          Rekonsiliasi Rekening
        </Link>
        .
      </p>
    </div>
  );
}
