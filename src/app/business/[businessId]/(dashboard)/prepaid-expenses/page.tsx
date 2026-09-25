import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addPrepaidExpense, postMonthlyAmortization } from "./actions";
import AddPrepaidExpenseForm from "./add-prepaid-expense-form";
import PostAmortizationButton from "./post-amortization-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
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

type PrepaidRow = {
  id: string;
  name: string;
  payment_date: string;
  total_amount: number;
  amortization_months: number;
  expense_account_code: string;
  amortized_amount: number;
  disposed_at: string | null;
};

export default async function PrepaidExpensesPage({
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
  const currentPeriod = `${today.slice(0, 7)}-01`;

  const [{ data: items }, { data: postings }, { data: alreadyPosted }, { data: expenseAccounts }] =
    await Promise.all([
      supabase
        .from("prepaid_expenses")
        .select(
          "id, name, payment_date, total_amount, amortization_months, expense_account_code, amortized_amount, disposed_at",
        )
        .eq("business_id", businessId)
        .order("payment_date", { ascending: false }),
      supabase
        .from("prepaid_expense_postings")
        .select("id, period, total_amount, created_at")
        .eq("business_id", businessId)
        .order("period", { ascending: false })
        .limit(24),
      supabase
        .from("prepaid_expense_postings")
        .select("id")
        .eq("business_id", businessId)
        .eq("period", currentPeriod)
        .maybeSingle(),
      supabase
        .from("accounts")
        .select("code, name")
        .eq("business_id", businessId)
        .eq("type", "beban")
        .order("code", { ascending: true }),
    ]);

  const rows = (items ?? []) as PrepaidRow[];
  const activeRows = rows.filter((r) => !r.disposed_at);
  const accountNameByCode = new Map((expenseAccounts ?? []).map((a) => [a.code, a.name]));

  const totalPaid = activeRows.reduce((s, r) => s + Number(r.total_amount), 0);
  const totalAmortized = activeRows.reduce((s, r) => s + Number(r.amortized_amount), 0);
  const totalRemaining = totalPaid - totalAmortized;

  const estimatedAmount = alreadyPosted
    ? 0
    : Math.round(
        activeRows.reduce((s, r) => {
          const monthly = Number(r.total_amount) / r.amortization_months;
          const remaining = Number(r.total_amount) - Number(r.amortized_amount);
          if (remaining <= 0) return s;
          return s + Math.min(monthly, remaining);
        }, 0),
      );

  const boundAddPrepaidExpense = addPrepaidExpense.bind(null, businessId);
  const boundPostAmortization = postMonthlyAmortization.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Biaya Dibayar Dimuka — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Biaya yang dibayar sekaligus di muka (langganan, sewa, asuransi, dll) tapi dicicil jadi beban
        bertahap tiap bulan, bukan langsung jadi beban penuh saat dibayar.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-white shadow-sm p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-400">Total Dibayar</p>
          <p className="text-base font-bold text-zinc-900">{formatRupiah(totalPaid)}</p>
        </div>
        <div className="rounded-xl bg-white shadow-sm p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-400">Sudah Dicicil</p>
          <p className="text-base font-bold text-amber-600">{formatRupiah(totalAmortized)}</p>
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-brand-700">Sisa Dibayar Dimuka</p>
          <p className="text-base font-bold text-brand-700">{formatRupiah(totalRemaining)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Catat Biaya Dibayar Dimuka</h2>
        <AddPrepaidExpenseForm
          action={boundAddPrepaidExpense}
          today={today}
          expenseAccounts={expenseAccounts ?? []}
        />
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Cicilan Bulanan</h2>
        <p className="mb-4 text-[11px] text-zinc-400">
          Total dibayar ÷ jumlah bulan cicilan, dihitung otomatis dari semua biaya dibayar dimuka yang
          masih aktif.
        </p>
        <PostAmortizationButton
          action={boundPostAmortization}
          period={currentPeriod}
          estimatedAmount={estimatedAmount}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Daftar Biaya Dibayar Dimuka</h2>
        </div>
        {rows.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const remaining = Number(r.total_amount) - Number(r.amortized_amount);
              const fullyAmortized = remaining <= 0;
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">{r.name}</p>
                      <p className="text-[11px] text-zinc-400">
                        Bayar {formatDate(r.payment_date)} · {r.amortization_months} bulan · ke akun{" "}
                        {accountNameByCode.get(r.expense_account_code) ?? r.expense_account_code}
                        {r.disposed_at && " · Dihapuskan"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-zinc-900">{formatRupiah(remaining)}</p>
                      <p className="text-[11px] font-medium text-zinc-400">
                        dari {formatRupiah(Number(r.total_amount))}
                        {fullyAmortized && !r.disposed_at && " · Lunas dicicil"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada biaya dibayar dimuka tercatat</p>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Cicilan</h2>
        </div>
        {postings && postings.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {postings.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <p className="text-[13px] font-medium text-zinc-700">{p.period.slice(0, 7)}</p>
                <p className="text-sm font-bold text-amber-600">{formatRupiah(Number(p.total_amount))}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada cicilan diposting</p>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Bayar otomatis ter-posting ke jurnal (debit Biaya Dibayar Dimuka, kredit Kas &amp; Bank). Cicilan
        bulanan diposting manual lewat tombol di atas (debit akun beban yang dipilih tiap item, kredit
        Biaya Dibayar Dimuka).
      </p>
    </div>
  );
}
