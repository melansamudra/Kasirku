import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { closePeriod } from "./actions";
import ClosePeriodForm from "./close-period-form";

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function lastDayOfPrevMonth(todayIso: string) {
  const [y, m] = todayIso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function TutupBukuPage({
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

  const today = todayStr();
  const asOfIso = `${today}T23:59:59+07:00`;

  const [{ data: accounts }, { data: entries }, { data: closings }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, type, normal_balance")
      .eq("business_id", businessId)
      .in("type", ["pendapatan", "beban"]),
    supabase
      .from("journal_entries")
      .select("journal_lines(debit, credit, account_id)")
      .eq("business_id", businessId)
      .lte("date", asOfIso),
    supabase
      .from("period_closings")
      .select("id, period_end, net_income, closed_at")
      .eq("business_id", businessId)
      .order("period_end", { ascending: false })
      .limit(24),
  ]);

  const balanceByAccount = new Map<string, number>();
  for (const entry of entries ?? []) {
    const lines = entry.journal_lines as unknown as {
      debit: number;
      credit: number;
      account_id: string;
    }[];
    for (const l of lines) {
      const cur = balanceByAccount.get(l.account_id) ?? 0;
      balanceByAccount.set(l.account_id, cur + Number(l.debit) - Number(l.credit));
    }
  }

  let totalPendapatan = 0;
  let totalBeban = 0;
  for (const a of accounts ?? []) {
    const raw = balanceByAccount.get(a.id) ?? 0;
    const balance = a.normal_balance === "debit" ? raw : -raw;
    if (a.type === "pendapatan") totalPendapatan += balance;
    else totalBeban += balance;
  }
  const labaBerjalan = totalPendapatan - totalBeban;

  const lastClosing = closings?.[0] ?? null;
  const defaultPeriodEnd = lastDayOfPrevMonth(today);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Tutup Buku — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Kunci laba/rugi suatu periode ke Laba Ditahan supaya tidak terus dihitung ulang di Neraca.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div
          className={`rounded-2xl border p-4 ${
            labaBerjalan >= 0 ? "border-brand-200 bg-brand-50" : "border-red-200 bg-red-50"
          }`}
        >
          <p
            className={`mb-1.5 text-[10.5px] font-semibold uppercase ${
              labaBerjalan >= 0 ? "text-brand-700" : "text-red-600"
            }`}
          >
            Laba Berjalan (belum ditutup)
          </p>
          <p className={`text-xl font-bold ${labaBerjalan >= 0 ? "text-brand-700" : "text-red-600"}`}>
            {formatRupiah(labaBerjalan)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
            Tutup Buku Terakhir
          </p>
          <p className="text-xl font-bold text-zinc-900">
            {lastClosing ? formatDate(lastClosing.period_end) : "Belum pernah"}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tutup Periode Baru</h2>
        <ClosePeriodForm
          businessId={businessId}
          defaultPeriodEnd={defaultPeriodEnd}
          action={closePeriod}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Tutup Buku</h2>
        </div>
        {closings && closings.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {closings.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900">
                    Sampai {formatDate(c.period_end)}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Ditutup {formatDate(c.closed_at.slice(0, 10))}
                  </p>
                </div>
                <p
                  className={`text-sm font-bold ${
                    Number(c.net_income) >= 0 ? "text-brand-700" : "text-red-600"
                  }`}
                >
                  {formatRupiah(Number(c.net_income))}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada periode yang ditutup</p>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Tutup buku memposting jurnal yang meng-nol-kan saldo Pendapatan &amp; Beban sejak tutup buku
        terakhir, lalu memindahkan selisihnya ke Laba Ditahan (3-100).
      </p>
    </div>
  );
}
