import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setBudget } from "./actions";
import AddBudgetForm from "./add-budget-form";

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const fromIso = `${period}-01T00:00:00+07:00`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const toIsoExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+07:00`;
  return { fromIso, toIsoExclusive };
}

export default async function AnggaranPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(periodParam ?? "")
    ? (periodParam as string)
    : new Date().toISOString().slice(0, 7);

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
    .select("id, code, name, type")
    .eq("business_id", businessId)
    .in("type", ["pendapatan", "beban"])
    .order("code", { ascending: true });

  const { data: budgets } = await supabase
    .from("budgets")
    .select("id, account_id, target_amount")
    .eq("business_id", businessId)
    .eq("period", period);

  const { fromIso, toIsoExclusive } = monthRange(period);
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId)
    .gte("date", fromIso)
    .lt("date", toIsoExclusive);

  const actualByAccount = new Map<string, number>();
  for (const e of entries ?? []) {
    const lines = e.journal_lines as unknown as { debit: number; credit: number; account_id: string }[];
    for (const l of lines) {
      const cur = actualByAccount.get(l.account_id) ?? 0;
      actualByAccount.set(l.account_id, cur + Number(l.debit) - Number(l.credit));
    }
  }

  const budgetByAccount = new Map((budgets ?? []).map((b) => [b.account_id, b]));
  const boundSetBudget = setBudget.bind(null, businessId);

  const rows = (accounts ?? []).map((a) => {
    const budget = budgetByAccount.get(a.id);
    const target = Number(budget?.target_amount ?? 0);
    const rawActual = actualByAccount.get(a.id) ?? 0;
    // Pendapatan bertambah lewat kredit, beban bertambah lewat debit.
    const actual = a.type === "pendapatan" ? -rawActual : rawActual;
    const variance = actual - target;
    const pct = target > 0 ? Math.round((actual / target) * 100) : null;
    return { ...a, target, actual, variance, pct, hasBudget: !!budget };
  });

  const pendapatanRows = rows.filter((r) => r.type === "pendapatan");
  const bebanRows = rows.filter((r) => r.type === "beban");

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Target vs Aktual — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Periode {period}</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="month"
            name="period"
            defaultValue={period}
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
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Set Target Bulan Ini</h2>
        <AddBudgetForm action={boundSetBudget} period={period} accounts={accounts ?? []} />
      </div>

      {[
        { label: "Pendapatan", list: pendapatanRows },
        { label: "Beban", list: bebanRows },
      ].map((group) => (
        <div key={group.label} className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-bold text-zinc-900">{group.label}</h2>
          </div>
          <div className="divide-y divide-zinc-50 px-4">
            {group.list.filter((r) => r.hasBudget).length > 0 ? (
              group.list
                .filter((r) => r.hasBudget)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">{r.name}</p>
                      <p className="text-[11px] text-zinc-400">
                        Target {formatRupiah(r.target)} · Aktual {formatRupiah(r.actual)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-sm font-bold ${
                          group.label === "Beban"
                            ? r.variance > 0
                              ? "text-red-500"
                              : "text-brand-700"
                            : r.variance < 0
                              ? "text-red-500"
                              : "text-brand-700"
                        }`}
                      >
                        {r.variance >= 0 ? "+" : ""}
                        {formatRupiah(r.variance)}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {r.pct === null ? "—" : `${r.pct}% dari target`}
                      </p>
                    </div>
                  </div>
                ))
            ) : (
              <p className="py-6 text-center text-xs text-zinc-300">Belum ada target diset</p>
            )}
          </div>
        </div>
      ))}

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Aktual dihitung dari jurnal (otomatis dari POS + manual) di bulan yang dipilih.
      </p>
    </div>
  );
}
