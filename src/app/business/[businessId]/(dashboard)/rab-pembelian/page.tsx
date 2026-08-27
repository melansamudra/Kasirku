import { notFound } from "next/navigation";
import Link from "next/link";
import { Wallet, TrendingDown, PiggyBank } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import { recalculateFromSales } from "./actions";
import BudgetLineRow from "./budget-line-row";
import BudgetGateToggle from "./budget-gate-toggle";

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function defaultPreviousMonth(period: string) {
  const [y, m] = period.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, "0")}`;
}

export default async function RabPembelianPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string; referencePeriod?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam, referencePeriod: referenceParam } = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(periodParam ?? "") ? (periodParam as string) : new Date().toISOString().slice(0, 7);
  const referencePeriod = /^\d{4}-\d{2}$/.test(referenceParam ?? "") ? (referenceParam as string) : defaultPreviousMonth(period);

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, procurement_budget_gate_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const [{ data: lines }, { data: ingredients }, { data: requests }] = await Promise.all([
    supabase
      .from("procurement_budget_lines")
      .select("id, ingredient_id, reference_period, suggested_qty, order_qty")
      .eq("business_id", businessId)
      .eq("period", period),
    supabase.from("ingredients").select("id, name, unit, unit_cost").eq("business_id", businessId),
    supabase
      .from("purchase_requests")
      .select("id, pr_number, employee_name, created_at")
      .eq("business_id", businessId)
      .gte("created_at", `${period}-01T00:00:00+07:00`)
      .lt(
        "created_at",
        `${period.slice(0, 4)}-${String(Number(period.slice(5, 7)) + 1).padStart(2, "0")}-01T00:00:00+07:00`,
      ),
  ]);

  const ingredientById = new Map((ingredients ?? []).map((i) => [i.id, i]));
  const budgetLines = (lines ?? [])
    .map((l) => ({ ...l, ingredient: ingredientById.get(l.ingredient_id) }))
    .filter((l) => l.ingredient)
    .sort((a, b) => a.ingredient!.name.localeCompare(b.ingredient!.name));

  const rabTotal = budgetLines.reduce((sum, l) => sum + Number(l.order_qty) * Number(l.ingredient!.unit_cost), 0);

  const periodRequests = requests ?? [];
  const { data: allItems } = await supabase
    .from("purchase_request_items")
    .select("id, purchase_request_id, item_name, ingredient_id, product_id, qty_ordered, approved_qty, budget_status")
    .eq("business_id", businessId)
    .in(
      "purchase_request_id",
      periodRequests.map((r) => r.id),
    );
  const { data: products } = await supabase.from("products").select("id, cost").eq("business_id", businessId);
  const priceByProduct = new Map((products ?? []).map((p) => [p.id, Number(p.cost)]));
  const requestById = new Map(periodRequests.map((r) => [r.id, r]));

  // Approval budget sekarang per ITEM ("per item barang, PR terkoreksi") --
  // "Terpakai" dihitung dari item yang APPROVED IN BUDGET, bukan dari PR utuh.
  const approvedItems = (allItems ?? [])
    .filter((it) => it.budget_status === "approved_in_budget")
    .map((it) => {
      const price = it.ingredient_id
        ? (ingredientById.get(it.ingredient_id)?.unit_cost ?? 0)
        : it.product_id
          ? (priceByProduct.get(it.product_id) ?? 0)
          : 0;
      const qty = Number(it.approved_qty ?? it.qty_ordered);
      return { ...it, value: price * qty, request: requestById.get(it.purchase_request_id) };
    })
    .filter((it) => it.request);

  const terpakai = approvedItems.reduce((sum, it) => sum + it.value, 0);
  const sisaKuota = rabTotal - terpakai;

  async function handleRecalculate() {
    "use server";
    await recalculateFromSales(businessId, period, referencePeriod);
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">RAB Pembelian — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Bulan RAB {period} · disusun dari penjualan bulan acuan {referencePeriod}
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-zinc-500">Bulan Acuan Penjualan</label>
            <input
              type="month"
              name="referencePeriod"
              defaultValue={referencePeriod}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-zinc-500">Bulan RAB</label>
            <input
              type="month"
              name="period"
              defaultValue={period}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            Tampilkan
          </button>
        </form>
      </div>

      <div className="mt-4">
        <BudgetGateToggle businessId={businessId} initialEnabled={business.procurement_budget_gate_enabled ?? false} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="RAB Bulan Ini" value={formatRupiah(rabTotal)} icon={PiggyBank} tone="brand" />
        <StatCard label="Terpakai (Item Approved)" value={formatRupiah(terpakai)} icon={TrendingDown} tone="blue" />
        <StatCard
          label="Sisa Kuota"
          value={formatRupiah(sisaKuota)}
          icon={Wallet}
          tone={sisaKuota < 0 ? "red" : "amber"}
        />
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Proyeksi Kebutuhan Order</h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Estimasi Porsi Terjual ({referencePeriod}) × Gramasi Resep — jadi acuan, jumlah order tetap keputusan
              manual.
            </p>
          </div>
          <form action={handleRecalculate}>
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              🔄 Hitung Ulang dari Penjualan
            </button>
          </form>
        </div>

        {budgetLines.length > 0 ? (
          <div className="mt-3">
            <div className="flex items-center gap-2 border-b border-zinc-100 pb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
              <span className="flex-1">Bahan</span>
              <span className="w-24 shrink-0 text-right">Order</span>
              <span className="w-24 shrink-0 text-right">Subtotal</span>
            </div>
            {budgetLines.map((l) => (
              <BudgetLineRow
                key={l.id}
                businessId={businessId}
                period={period}
                ingredientId={l.ingredient_id}
                name={l.ingredient!.name}
                unit={l.ingredient!.unit}
                unitCost={Number(l.ingredient!.unit_cost)}
                suggestedQty={Number(l.suggested_qty)}
                initialOrderQty={Number(l.order_qty)}
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada data — klik &ldquo;Hitung Ulang dari Penjualan&rdquo; untuk mulai dari penjualan bulan acuan.
          </p>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-bold text-zinc-900">Item Terverifikasi Budget di Bulan Ini</h2>
        </div>
        <div className="divide-y divide-zinc-50 px-4">
          {approvedItems.length > 0 ? (
            approvedItems.map((it) => (
              <Link
                key={it.id}
                href={`/business/${businessId}/permintaan-barang/${it.request!.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-zinc-900">{it.item_name}</p>
                  <p className="text-[11px] text-zinc-400">
                    {it.request!.pr_number} · {it.request!.employee_name}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-zinc-700">{formatRupiah(it.value)}</p>
              </Link>
            ))
          ) : (
            <p className="py-6 text-center text-xs text-zinc-300">Belum ada item yang APPROVED IN BUDGET bulan ini</p>
          )}
        </div>
      </div>
    </div>
  );
}
