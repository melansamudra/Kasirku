import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPeriodRange } from "../business/[businessId]/reports/period";
import LogoutButton from "./logout-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, business_type")
    .order("created_at", { ascending: true });

  if (!businesses || businesses.length === 0) {
    redirect("/onboarding");
  }

  const businessIds = businesses.map((b) => b.id);
  const { fromIso } = getPeriodRange("today");

  const { data: todayTx } = await supabase
    .from("transactions")
    .select("business_id, total, voided")
    .in("business_id", businessIds)
    .gte("date", fromIso ?? undefined);

  const { data: openShifts } = await supabase
    .from("shifts")
    .select("business_id")
    .in("business_id", businessIds)
    .is("closed_at", null);

  const openShiftBusinessIds = new Set((openShifts ?? []).map((s) => s.business_id));

  const { data: trackedProducts } = await supabase
    .from("products")
    .select("business_id, stock, min_stock")
    .in("business_id", businessIds)
    .is("deleted_at", null)
    .gt("min_stock", 0);

  const { data: trackedIngredients } = await supabase
    .from("ingredients")
    .select("business_id, stock, min_stock")
    .in("business_id", businessIds)
    .is("deleted_at", null)
    .gt("min_stock", 0);

  const lowStockCount = new Map<string, number>();
  for (const item of [...(trackedProducts ?? []), ...(trackedIngredients ?? [])]) {
    if (Number(item.stock) <= Number(item.min_stock)) {
      lowStockCount.set(item.business_id, (lowStockCount.get(item.business_id) ?? 0) + 1);
    }
  }

  const todaySummary = new Map<string, { revenue: number; count: number }>();
  for (const t of todayTx ?? []) {
    if (t.voided) continue;
    const entry = todaySummary.get(t.business_id) ?? { revenue: 0, count: 0 };
    entry.revenue += Number(t.total);
    entry.count += 1;
    todaySummary.set(t.business_id, entry);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-bold text-zinc-900">Toko kamu</h1>
          <p className="mt-1 text-sm text-zinc-500">{user?.email}</p>
        </div>

        <div className="space-y-3">
          {businesses.map((b) => {
            const summary = todaySummary.get(b.id) ?? { revenue: 0, count: 0 };
            const shiftOpen = openShiftBusinessIds.has(b.id);
            const lowStock = lowStockCount.get(b.id) ?? 0;
            return (
            <div key={b.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900">{b.name}</p>
                  <p className="text-xs text-zinc-500">
                    {b.business_type === "fnb" ? "🍽️ Restoran / Kafe / F&B" : "🛒 Retail / Toko"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {shiftOpen && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                      ● Shift aktif
                    </span>
                  )}
                  {lowStock > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                      ⚠️ {lowStock} stok rendah
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 rounded-xl bg-zinc-50 px-3 py-2.5">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-zinc-400">
                    Penjualan Hari Ini
                  </p>
                  <p className="text-base font-bold text-zinc-900">
                    {formatRupiah(summary.revenue)}
                  </p>
                </div>
                <div className="border-l border-zinc-200 pl-4">
                  <p className="text-[10px] font-semibold uppercase text-zinc-400">Transaksi</p>
                  <p className="text-base font-bold text-zinc-900">{summary.count}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                <Link
                  href={`/business/${b.id}/pos`}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Buka Kasir →
                </Link>
                <Link
                  href={`/business/${b.id}/transactions`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Riwayat Transaksi
                </Link>
                <Link
                  href={`/business/${b.id}/products`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Kelola Produk
                </Link>
                {b.business_type === "fnb" && (
                  <>
                    <Link
                      href={`/business/${b.id}/ingredients`}
                      className="text-xs font-medium text-zinc-500 hover:underline"
                    >
                      Bahan Baku
                    </Link>
                    <Link
                      href={`/business/${b.id}/tables`}
                      className="text-xs font-medium text-zinc-500 hover:underline"
                    >
                      Meja & Self-Order
                    </Link>
                  </>
                )}
                <Link
                  href={`/business/${b.id}/customers`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Pelanggan
                </Link>
                <Link
                  href={`/business/${b.id}/cashiers`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Kelola Kasir
                </Link>
                <Link
                  href={`/business/${b.id}/shifts`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Riwayat Shift
                </Link>
                <Link
                  href={`/business/${b.id}/reports`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Laporan
                </Link>
                <Link
                  href={`/business/${b.id}/finance`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Keuangan
                </Link>
                <Link
                  href={`/business/${b.id}/settings`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Pengaturan
                </Link>
                <Link
                  href={`/business/${b.id}/activity`}
                  className="text-xs font-medium text-zinc-500 hover:underline"
                >
                  Aktivitas
                </Link>
              </div>
            </div>
            );
          })}
        </div>

        <LogoutButton />
      </div>
    </div>
  );
}
