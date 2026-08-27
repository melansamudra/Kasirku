import { notFound } from "next/navigation";
import Link from "next/link";
import { Wallet, TrendingDown, PiggyBank } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import { setProcurementBudget } from "./actions";
import SetBudgetForm from "./set-budget-form";

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

export default async function RabPembelianPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(periodParam ?? "") ? (periodParam as string) : new Date().toISOString().slice(0, 7);

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const [{ data: budgetRow }, { data: requests }, { data: ingredients }, { data: products }] = await Promise.all([
    supabase.from("procurement_budgets").select("id, amount").eq("business_id", businessId).eq("period", period).maybeSingle(),
    supabase
      .from("purchase_requests")
      .select("id, pr_number, employee_name, created_at, budget_status")
      .eq("business_id", businessId)
      .gte("created_at", `${period}-01T00:00:00+07:00`)
      .lt(
        "created_at",
        `${period.slice(0, 4)}-${String(Number(period.slice(5, 7)) + 1).padStart(2, "0")}-01T00:00:00+07:00`,
      ),
    supabase.from("ingredients").select("id, unit_cost").eq("business_id", businessId),
    supabase.from("products").select("id, cost").eq("business_id", businessId),
  ]);

  const priceByIngredient = new Map((ingredients ?? []).map((i) => [i.id, Number(i.unit_cost)]));
  const priceByProduct = new Map((products ?? []).map((p) => [p.id, Number(p.cost)]));

  const approvedRequests = (requests ?? []).filter((r) => r.budget_status === "approved_in_budget");
  const { data: allItems } = await supabase
    .from("purchase_request_items")
    .select("purchase_request_id, ingredient_id, product_id, qty_ordered")
    .eq("business_id", businessId)
    .in(
      "purchase_request_id",
      approvedRequests.map((r) => r.id),
    );

  const valueByRequest = new Map<string, number>();
  for (const it of allItems ?? []) {
    const price = it.ingredient_id
      ? (priceByIngredient.get(it.ingredient_id) ?? 0)
      : it.product_id
        ? (priceByProduct.get(it.product_id) ?? 0)
        : 0;
    const cur = valueByRequest.get(it.purchase_request_id) ?? 0;
    valueByRequest.set(it.purchase_request_id, cur + price * Number(it.qty_ordered));
  }

  const rabAmount = Number(budgetRow?.amount ?? 0);
  const terpakai = approvedRequests.reduce((sum, r) => sum + (valueByRequest.get(r.id) ?? 0), 0);
  const sisaKuota = rabAmount - terpakai;
  const boundSetBudget = setProcurementBudget.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">RAB Pembelian — {business.name}</h1>
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

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="RAB Bulan Ini" value={formatRupiah(rabAmount)} icon={PiggyBank} tone="brand" />
        <StatCard label="Terpakai (PR Approved)" value={formatRupiah(terpakai)} icon={TrendingDown} tone="blue" />
        <StatCard
          label="Sisa Kuota"
          value={formatRupiah(sisaKuota)}
          icon={Wallet}
          tone={sisaKuota < 0 ? "red" : "amber"}
        />
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Set RAB Bulan Ini</h2>
        <SetBudgetForm action={boundSetBudget} period={period} currentAmount={rabAmount} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-bold text-zinc-900">PR Terverifikasi Budget di Periode Ini</h2>
        </div>
        <div className="divide-y divide-zinc-50 px-4">
          {approvedRequests.length > 0 ? (
            approvedRequests.map((r) => (
              <Link
                key={r.id}
                href={`/business/${businessId}/permintaan-barang/${r.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-zinc-900">{r.pr_number}</p>
                  <p className="text-[11px] text-zinc-400">{r.employee_name}</p>
                </div>
                <p className="shrink-0 text-sm font-bold text-zinc-700">
                  {formatRupiah(valueByRequest.get(r.id) ?? 0)}
                </p>
              </Link>
            ))
          ) : (
            <p className="py-6 text-center text-xs text-zinc-300">Belum ada PR yang APPROVED IN BUDGET bulan ini</p>
          )}
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
&ldquo;Terpakai&rdquo; dihitung dari estimasi nilai (qty × harga bahan terkini) PR yang sudah APPROVED IN BUDGET —
        bukan harga final PO.
      </p>
    </div>
  );
}
