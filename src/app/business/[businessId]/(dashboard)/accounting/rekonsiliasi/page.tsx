import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addAccountReconciliation } from "./actions";
import ReconciliationForm from "./reconciliation-form";

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function RekonsiliasiPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ account?: string; date?: string }>;
}) {
  const { businessId } = await params;
  const { account: accountParam, date } = await searchParams;
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "")
    ? (date as string)
    : new Date().toISOString().slice(0, 10);
  const asOfIso = `${asOfDate}T23:59:59+07:00`;

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code, name, normal_balance")
    .eq("business_id", businessId)
    .eq("type", "aset")
    .order("code", { ascending: true });

  if (!accounts || accounts.length === 0) {
    notFound();
  }

  const selectedAccount =
    accounts.find((a) => a.id === accountParam) ?? accounts[0];

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId)
    .lte("date", asOfIso);

  let raw = 0;
  for (const entry of entries ?? []) {
    const lines = entry.journal_lines as unknown as {
      debit: number;
      credit: number;
      account_id: string;
    }[];
    for (const l of lines) {
      if (l.account_id === selectedAccount.id) {
        raw += Number(l.debit) - Number(l.credit);
      }
    }
  }
  const bookBalance = selectedAccount.normal_balance === "debit" ? raw : -raw;

  const { data: history } = await supabase
    .from("account_reconciliations")
    .select("id, statement_date, book_balance, statement_balance, difference, note")
    .eq("business_id", businessId)
    .eq("account_id", selectedAccount.id)
    .order("statement_date", { ascending: false })
    .limit(10);

  const lastRecon = history?.[0];
  const windowFromDate = lastRecon ? addDays(lastRecon.statement_date, 1) : addDays(asOfDate, -30);
  const windowFromIso = `${windowFromDate}T00:00:00+07:00`;

  const { data: windowEntries } = await supabase
    .from("journal_entries")
    .select("date, description, journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId)
    .gte("date", windowFromIso)
    .lte("date", asOfIso)
    .order("date", { ascending: false });

  const mutations = (windowEntries ?? []).flatMap((e) => {
    const lines = e.journal_lines as unknown as {
      debit: number;
      credit: number;
      account_id: string;
    }[];
    return lines
      .filter((l) => l.account_id === selectedAccount.id)
      .map((l) => ({ date: e.date, description: e.description, debit: Number(l.debit), credit: Number(l.credit) }));
  });

  const boundAddReconciliation = addAccountReconciliation.bind(null, businessId);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Rekonsiliasi Rekening — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Bandingkan saldo menurut jurnal dengan saldo rekening koran/kas fisik.
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <select
            name="account"
            defaultValue={selectedAccount.id}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="date"
            defaultValue={asOfDate}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Tampilkan
          </button>
        </form>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-xs text-zinc-500">Saldo Menurut Jurnal per {asOfDate}</p>
        <p className="mt-1 text-2xl font-bold text-zinc-900">{formatRupiah(bookBalance)}</p>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Catat Rekonsiliasi</h2>
        <ReconciliationForm
          action={boundAddReconciliation}
          today={today}
          accounts={accounts}
          selectedAccountId={selectedAccount.id}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-bold text-zinc-900">
            Mutasi {selectedAccount.name} sejak{" "}
            {lastRecon ? `rekonsiliasi terakhir (${formatDate(lastRecon.statement_date)})` : `30 hari sebelum ${asOfDate}`}
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Cek daftar ini kalau ada selisih — biasanya karena transfer/setoran yang belum settle di
            bank.
          </p>
        </div>
        <div className="divide-y divide-zinc-50 px-4">
          {mutations.length === 0 && (
            <p className="py-6 text-center text-xs text-zinc-300">Tidak ada mutasi di rentang ini.</p>
          )}
          {mutations.map((m, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-2 text-xs">
              <div className="min-w-0">
                <p className="truncate text-zinc-700">{m.description}</p>
                <p className="text-[11px] text-zinc-400">{formatDate(m.date)}</p>
              </div>
              <span className="shrink-0 font-medium text-zinc-800">
                {m.debit > 0 ? formatRupiah(m.debit) : `(${formatRupiah(m.credit)})`}
              </span>
            </div>
          ))}
        </div>
      </div>

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
                <span className="font-medium text-zinc-700">{formatDate(h.statement_date)}</span>
                <span
                  className={
                    Math.abs(Number(h.difference)) < 1
                      ? "font-semibold text-brand-700"
                      : "font-semibold text-red-600"
                  }
                >
                  {Math.abs(Number(h.difference)) < 1 ? "✓ Cocok" : `Selisih ${formatRupiah(Number(h.difference))}`}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-zinc-400">
                <span>
                  Buku {formatRupiah(Number(h.book_balance))} vs Bank {formatRupiah(Number(h.statement_balance))}
                </span>
              </div>
              {h.note && <p className="mt-0.5 text-[11px] text-zinc-400">{h.note}</p>}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Alat ini tidak mengubah jurnal — cuma mencatat perbandingan saldo sebagai riwayat. Kalau
        ketemu selisih yang perlu dikoreksi, tambahkan lewat{" "}
        <Link href={`/business/${businessId}/accounting/jurnal`} className="text-brand-600 hover:underline">
          Jurnal Manual
        </Link>
        .
      </p>
    </div>
  );
}
