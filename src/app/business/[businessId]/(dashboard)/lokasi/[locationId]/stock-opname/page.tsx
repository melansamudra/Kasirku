import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StockOpnameLinkBox from "./link-box";
import { VerifyEntryButtons, VerifyAllButton } from "./verify-buttons";

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
    .select("id, name")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) {
    notFound();
  }

  const [{ data: pendingEntries }, { data: adjustments }] = await Promise.all([
    supabase
      .from("stock_opname_entries")
      .select("id, item_name, unit, reported_stock, system_stock_at_report, submitted_by_name, entry_date, created_at")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .eq("status", "pending")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("stock_adjustments")
      .select("id, item_name, unit, stock_before, stock_after, diff, entry_date, submitted_by_name, created_at")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .eq("reason", "Stok opname")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const pendingByDate = new Map<string, typeof pendingEntries>();
  for (const row of pendingEntries ?? []) {
    const list = pendingByDate.get(row.entry_date) ?? [];
    list.push(row);
    pendingByDate.set(row.entry_date, list);
  }

  const verifiedByDate = new Map<string, typeof adjustments>();
  for (const row of adjustments ?? []) {
    const list = verifiedByDate.get(row.entry_date) ?? [];
    list.push(row);
    verifiedByDate.set(row.entry_date, list);
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
        Laporan stok fisik dari staf menunggu diverifikasi dulu sebelum mengubah stok sistem.
      </p>

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

      {pendingByDate.size > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-amber-700">⏳ Menunggu Verifikasi</h2>
          <div className="space-y-4">
            {[...pendingByDate.entries()].map(([date, rows]) => (
              <div key={date} className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
                <div className="flex items-center justify-between border-b border-amber-200 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">{formatDate(date)}</h3>
                    <p className="text-[11px] text-zinc-500">{rows!.length} bahan dilaporkan</p>
                  </div>
                  <VerifyAllButton businessId={businessId} locationId={locationId} entryDate={date} count={rows!.length} />
                </div>
                <div className="divide-y divide-amber-100 bg-white">
                  {rows!.map((r) => {
                    const selisih = Number(r.reported_stock) - Number(r.system_stock_at_report);
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-zinc-800">{r.item_name}</p>
                          <p className="text-[10.5px] text-zinc-400">
                            Stok Data: {formatQty(Number(r.system_stock_at_report))} {r.unit} · Stok Riil:{" "}
                            {formatQty(Number(r.reported_stock))} {r.unit} · Selisih{" "}
                            <span className={selisih === 0 ? "text-zinc-400" : selisih > 0 ? "text-brand-600" : "text-red-500"}>
                              {selisih > 0 ? "+" : ""}
                              {formatQty(selisih)}
                            </span>{" "}
                            · {r.submitted_by_name}
                          </p>
                        </div>
                        <VerifyEntryButtons businessId={businessId} locationId={locationId} entryId={r.id} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <h2 className="text-sm font-bold text-zinc-900">Riwayat Terverifikasi</h2>
        {verifiedByDate.size > 0 ? (
          [...verifiedByDate.entries()].map(([date, rows]) => (
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
            Belum ada riwayat stok opname terverifikasi di lokasi ini.
          </p>
        )}
      </div>
    </div>
  );
}
