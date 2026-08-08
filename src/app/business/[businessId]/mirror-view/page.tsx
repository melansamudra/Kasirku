import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  PERIOD_COOKIE_NAME,
  getPeriodRange,
  parsePeriod,
} from "../(dashboard)/reports/period";
import PeriodTabs from "../(dashboard)/reports/period-tabs";

function fmt(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

export default async function MirrorLaporanPage({
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
    show_purchases?: boolean;
    show_kas_harian?: boolean;
  };

  const [txResult, kasResult] = await Promise.all([
    p.show_transactions
      ? service
          .from("mirror_visible_transactions")
          .select(
            "transaction_id, transactions!mirror_visible_transactions_transaction_id_fkey(id, date, total, voided)",
          )
          .eq("business_id", businessId)
      : Promise.resolve({ data: null }),

    p.show_kas_harian
      ? service
          .from("mirror_visible_kas")
          .select(
            "journal_line_id, journal_lines!mirror_visible_kas_journal_line_id_fkey(id, debit, credit, journal_entries!inner(date))",
          )
          .eq("business_id", businessId)
      : Promise.resolve({ data: null }),
  ]);

  type TxData = { id: string; date: string; total: number; voided: boolean };

  const filteredTxs = (txResult.data ?? [])
    .map((row) => {
      const t = row.transactions as unknown as TxData | null;
      return t;
    })
    .filter((t): t is TxData => {
      if (!t || t.voided) return false;
      if (fromIso && t.date < fromIso) return false;
      if (toIsoExclusive && t.date >= toIsoExclusive) return false;
      return true;
    });

  const totalTx = filteredTxs.reduce((s, t) => s + Number(t.total), 0);
  const countTx = filteredTxs.length;
  const avgTx = countTx > 0 ? totalTx / countTx : 0;

  type KasLine = { id: string; debit: number; credit: number; date: string };

  const filteredKas = (kasResult.data ?? [])
    .map((row) => {
      const line = row.journal_lines as unknown as {
        id: string;
        debit: number;
        credit: number;
        journal_entries: { date: string } | null;
      } | null;
      if (!line?.journal_entries) return null;
      return {
        id: line.id,
        debit: Number(line.debit),
        credit: Number(line.credit),
        date: line.journal_entries.date,
      };
    })
    .filter((k): k is KasLine => {
      if (!k) return false;
      if (fromIso && k.date < fromIso) return false;
      if (toIsoExclusive && k.date >= toIsoExclusive) return false;
      return true;
    });

  const totalKasMasuk = filteredKas.reduce((s, k) => s + k.debit, 0);
  const totalKasKeluar = filteredKas.reduce((s, k) => s + k.credit, 0);

  const basePath = `/business/${businessId}/mirror-view`;

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Laporan</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ringkasan data yang dibagikan oleh pemilik toko
          </p>
        </div>
        <PeriodTabs basePath={basePath} period={period} />
      </div>

      {period === "custom" && (
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-medium text-zinc-600">
            Dari
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Sampai
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Terapkan
          </button>
        </form>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {p.show_transactions && (
          <>
            <div className="rounded-2xl bg-brand-600 px-5 py-4 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                Total Transaksi
              </p>
              <p className="mt-1 text-2xl font-bold">
                {p.show_amount ? fmt(totalTx) : `${countTx} transaksi`}
              </p>
              {p.show_amount && (
                <p className="mt-0.5 text-xs opacity-70">{countTx} transaksi</p>
              )}
            </div>
            {p.show_amount && (
              <div className="rounded-2xl border border-zinc-100 bg-white px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Rata-rata per Transaksi
                </p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{fmt(avgTx)}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{countTx} transaksi</p>
              </div>
            )}
          </>
        )}

        {p.show_kas_harian && (
          <>
            <div className="rounded-2xl border border-zinc-100 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Kas Masuk
              </p>
              <p className="mt-1 text-2xl font-bold text-brand-700">{fmt(totalKasMasuk)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-100 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Kas Keluar
              </p>
              <p className="mt-1 text-2xl font-bold text-red-500">{fmt(totalKasKeluar)}</p>
            </div>
          </>
        )}

        {!p.show_transactions && !p.show_kas_harian && (
          <div className="col-span-2 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center">
            <p className="text-2xl mb-2">👁</p>
            <p className="text-sm font-medium text-zinc-700">Belum ada data laporan</p>
            <p className="mt-1 text-xs text-zinc-400">
              Pemilik toko belum mengaktifkan data untuk akun mirror Anda.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
