import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StockOpnameLinkBox from "./link-box";

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatQty(value: number) {
  return Number(value).toLocaleString("id-ID");
}

export default async function LocationStockOpnamePage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, stock_opname_slug")
    .eq("id", businessId)
    .single();
  if (!business || !business.cost_control_enabled) {
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

  const { data: adjustments } = await supabase
    .from("stock_adjustments")
    .select("id, item_name, unit, stock_before, stock_after, diff, entry_date, submitted_by_name, created_at")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .eq("reason", "Stok opname")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const byDate = new Map<string, typeof adjustments>();
  for (const row of adjustments ?? []) {
    const list = byDate.get(row.entry_date) ?? [];
    list.push(row);
    byDate.set(row.entry_date, list);
  }

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">Stok Opname — {location.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Riwayat input stok fisik harian dari staf, dikelompokkan per tanggal.
      </p>

      {location.is_production ? (
        <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Link Stok Opname</h2>
          <div className="mt-3">
            <StockOpnameLinkBox
              businessId={businessId}
              locationId={locationId}
              initialSlug={business.stock_opname_slug ?? ""}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
          Link publik stok opname baru tersedia untuk lokasi produksi (Dapur Produksi).
        </p>
      )}

      <div className="mt-6 space-y-4">
        {byDate.size > 0 ? (
          [...byDate.entries()].map(([date, rows]) => (
            <div key={date} className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h3 className="text-sm font-bold text-zinc-900">{formatDate(date)}</h3>
                <p className="text-[11px] text-zinc-400">{rows!.length} bahan disesuaikan</p>
              </div>
              <div className="divide-y divide-zinc-100">
                {rows!.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-800">{r.item_name}</p>
                      <p className="text-[10.5px] text-zinc-400">
                        {formatQty(Number(r.stock_before))} → {formatQty(Number(r.stock_after))} {r.unit}
                        {r.submitted_by_name ? ` · ${r.submitted_by_name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-semibold ${
                        Number(r.diff) > 0 ? "text-brand-600" : "text-red-500"
                      }`}
                    >
                      {Number(r.diff) > 0 ? "+" : ""}
                      {formatQty(Number(r.diff))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400">
            Belum ada riwayat stok opname di lokasi ini.
          </p>
        )}
      </div>
    </div>
  );
}
