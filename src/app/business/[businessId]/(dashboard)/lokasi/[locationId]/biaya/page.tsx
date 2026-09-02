import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import { PERIOD_COOKIE_NAME, PERIOD_DESCRIPTIONS, getPeriodRange, parsePeriod } from "../../../reports/period";
import PeriodTabs from "../../../reports/period-tabs";
import { addExpense } from "../../../finance/actions";
import DeleteExpenseButton from "../../../finance/delete-expense-button";
import AddLocationExpenseForm from "./add-location-expense-form";
import { computeAllSemiFinishedItemCosts } from "@/lib/cost-control/compute-cost";
import { payslipTotal, type PayslipAgg } from "@/lib/payroll/payslip-total";

// Markup internal BSJ dipakai CUMA untuk laporan cost center di halaman ini --
// TIDAK PERNAH ditulis ke unit_cost/HPP asli (yang tetap murni biaya bahan,
// dipakai buat harga jual & margin Produk Jadi sebenarnya). Angka ini murni
// alat bantu jawab "apakah Dapur Produksi menutup biaya sendiri kalau BSJ-nya
// 'dihargai' segini" -- Sistem A yang disepakati user (2026-08-31), bukan
// transaksi/jurnal sungguhan. Dikalibrasi manual (edit angka ini) setelah
// lihat data 1 bulan nyata, bukan lewat pengaturan UI -- belum perlu.
const INTERNAL_BSJ_MARKUP = 0.2;

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

export default async function LocationBiayaPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { businessId, locationId } = await params;
  const { period: periodParam, from, to } = await searchParams;
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);

  const supabase = await createClient();
  const today = todayWibDateString();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !(business.cost_control_enabled || business.rich_stock_ops_enabled)) {
    notFound();
  }

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name, is_production")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) {
    notFound();
  }

  let expQuery = supabase
    .from("expenses")
    .select("id, date, category, amount, note")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .order("date", { ascending: false });
  if (fromIso) expQuery = expQuery.gte("date", fromIso.slice(0, 10));
  if (toIsoExclusive) expQuery = expQuery.lt("date", toIsoExclusive.slice(0, 10));
  const { data: expenses } = await expQuery;

  const total = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + Number(e.amount));
  }

  const boundAddExpense = addExpense.bind(null, businessId);

  // Cost center Dapur Produksi (Sistem A -- laporan internal, tidak masuk
  // jurnal/Laba Rugi resmi, lihat [[project-llauk-cost-control-locations]]).
  // Cuma dihitung untuk lokasi produksi -- konsepnya ("berapa biaya nutup
  // BSJ yang keluar") tidak berlaku untuk Gudang Utama/Kitchen/Bar.
  let costCenter: {
    bahanCost: number;
    gajiCost: number;
    opCost: number;
    totalCost: number;
    bsjValue: number;
    surplus: number;
  } | null = null;

  if (location.is_production) {
    const [{ data: productionRuns }, { data: payslipRows }, { data: transfers }] = await Promise.all([
      (() => {
        let q = supabase
          .from("production_runs")
          .select("total_cost")
          .eq("business_id", businessId)
          .eq("status", "verified")
          .eq("voided", false);
        if (fromIso) q = q.gte("produced_at", fromIso);
        if (toIsoExclusive) q = q.lt("produced_at", toIsoExclusive);
        return q;
      })(),
      (() => {
        let q = supabase
          .from("payslips")
          .select(
            "base_pay, meal_allowance, attendance_allowance, lembur_amount, thr_amount, izin_deduction, izin_weekend_penalty, late_deduction, kasbon_deduction, personal_loan_deduction, payslip_adjustments(type, amount), employees!inner(location_id)",
          )
          .eq("business_id", businessId)
          .eq("employees.location_id", locationId);
        if (fromIso) q = q.gte("period_start", fromIso.slice(0, 10));
        if (toIsoExclusive) q = q.lt("period_start", toIsoExclusive.slice(0, 10));
        return q;
      })(),
      (() => {
        let q = supabase
          .from("location_transfers")
          .select("id")
          .eq("business_id", businessId)
          .eq("from_location_id", locationId)
          .eq("status", "dikirim");
        if (fromIso) q = q.gte("fulfilled_at", fromIso);
        if (toIsoExclusive) q = q.lt("fulfilled_at", toIsoExclusive);
        return q;
      })(),
    ]);

    const bahanCost = (productionRuns ?? []).reduce((sum, r) => sum + Number(r.total_cost), 0);
    const gajiCost = (payslipRows ?? []).reduce((sum, p) => sum + payslipTotal(p as unknown as PayslipAgg), 0);

    const transferIds = (transfers ?? []).map((t) => t.id);
    const { data: transferItems } = transferIds.length
      ? await supabase
          .from("location_transfer_items")
          .select("semi_finished_item_id, qty_sent")
          .in("transfer_id", transferIds)
      : { data: [] };

    const semiCosts = await computeAllSemiFinishedItemCosts(supabase, businessId);
    let bsjValue = 0;
    for (const item of transferItems ?? []) {
      const unitCost = semiCosts.get(item.semi_finished_item_id)?.unitCost ?? 0;
      bsjValue += Number(item.qty_sent ?? 0) * unitCost * (1 + INTERNAL_BSJ_MARKUP);
    }

    const totalCost = bahanCost + gajiCost + total;
    costCenter = { bahanCost, gajiCost, opCost: total, totalCost, bsjValue, surplus: bsjValue - totalCost };
  }

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">
            {costCenter ? "Biaya & Cost Center" : "Biaya Operasional"} — {location.name}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/lokasi/${locationId}/biaya`} period={period} />
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Listrik, gas, dan biaya lain di luar bahan baku &amp; tenaga kerja — tercatat sebagai
        pengeluaran khusus lokasi ini, sekaligus otomatis masuk jurnal akuntansi seperti
        pengeluaran biasa.
      </p>

      {period === "custom" && (
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4">
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

      {costCenter && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[11px] font-semibold text-amber-800">
            📊 P&amp;L Dapur Produksi — Laporan Internal
          </p>
          <p className="mt-0.5 text-[10.5px] text-amber-700">
            Murni buat lihat sehat/tidaknya dapur ini. Tidak masuk Jurnal/Laba Rugi resmi, tidak
            mengubah HPP Produk Jadi.
          </p>
          <div className="mt-3 space-y-1 text-[12px] text-zinc-700">
            <div className="flex justify-between">
              <span>Biaya bahan (produksi terverifikasi)</span>
              <span className="font-medium">{formatRupiah(costCenter.bahanCost)}</span>
            </div>
            <div className="flex justify-between">
              <span>Biaya gaji (karyawan lokasi ini)</span>
              <span className="font-medium">{formatRupiah(costCenter.gajiCost)}</span>
            </div>
            <div className="flex justify-between">
              <span>Biaya operasional</span>
              <span className="font-medium">{formatRupiah(costCenter.opCost)}</span>
            </div>
            <div className="flex justify-between border-t border-amber-200 pt-1 font-semibold text-zinc-900">
              <span>Total Biaya</span>
              <span>{formatRupiah(costCenter.totalCost)}</span>
            </div>
            <div className="flex justify-between pt-1.5">
              <span>Nilai BSJ keluar (HPP bahan + {Math.round(INTERNAL_BSJ_MARKUP * 100)}%)</span>
              <span className="font-medium">{formatRupiah(costCenter.bsjValue)}</span>
            </div>
            <div
              className={`flex justify-between border-t border-amber-200 pt-1 text-sm font-bold ${
                costCenter.surplus >= 0 ? "text-brand-700" : "text-red-600"
              }`}
            >
              <span>{costCenter.surplus >= 0 ? "Surplus" : "Defisit"}</span>
              <span>{formatRupiah(Math.abs(costCenter.surplus))}</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-brand-700 p-4">
        <p className="text-[11px] font-medium text-brand-200">Total Biaya Operasional Periode Ini</p>
        <p className="text-lg font-bold text-white">{formatRupiah(total)}</p>
        {byCategory.size > 0 && (
          <div className="mt-2 space-y-0.5">
            {[...byCategory.entries()].map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-[11px] text-brand-100">
                <span>{cat}</span>
                <span>{formatRupiah(amt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Catat Biaya</h2>
        <AddLocationExpenseForm action={boundAddExpense} today={today} locationId={locationId} />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Biaya</h2>
          <span className="text-[10.5px] font-semibold uppercase text-zinc-400">
            {expenses?.length ?? 0} tercatat
          </span>
        </div>
        {expenses && expenses.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-zinc-900">{e.category}</p>
                  <p className="truncate text-[11px] text-zinc-400">
                    {formatDate(e.date)}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-zinc-900">{formatRupiah(Number(e.amount))}</span>
                <DeleteExpenseButton businessId={businessId} expenseId={e.id} />
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-14 text-center text-xs text-zinc-400">Belum ada biaya tercatat.</p>
        )}
      </div>
    </div>
  );
}
