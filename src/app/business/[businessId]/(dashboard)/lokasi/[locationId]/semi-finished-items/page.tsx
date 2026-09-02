import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdjustStockForm from "@/components/adjust-stock-form";
import { adjustSemiFinishedLocationStock } from "./actions";

export default async function LocationSemiFinishedItemsPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

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
    .select("id, name")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!location) {
    notFound();
  }

  const [{ data: items }, { data: stockRows }, { data: adjustments }] = await Promise.all([
    supabase
      .from("semi_finished_items")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("semi_finished_item_location_stock")
      .select("semi_finished_item_id, stock")
      .eq("business_id", businessId)
      .eq("location_id", locationId),
    supabase
      .from("stock_adjustments")
      .select("id, item_name, unit, stock_before, stock_after, diff, reason, created_at")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .not("semi_finished_item_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const stockByItem = new Map((stockRows ?? []).map((r) => [r.semi_finished_item_id, Number(r.stock)]));

  return (
    <div className="w-full max-w-2xl">
      <p className="text-xs text-zinc-400">
        <Link href={`/business/${businessId}/semi-finished-items`} className="hover:text-brand-600 hover:underline">
          Bahan Setengah Jadi
        </Link>{" "}
        · Stok per Lokasi
      </p>
      <h1 className="mt-1 text-lg font-bold text-zinc-900">
        Bahan Setengah Jadi — {location.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Stok bahan setengah jadi khusus lokasi <strong>{location.name}</strong> — terpisah dari
        stok pusat. Daftar menunya sama (satu master untuk seluruh bisnis), cuma jumlah stoknya
        dilacak sendiri-sendiri per lokasi.
      </p>

      <div className="mt-6 space-y-2">
        {items && items.length > 0 ? (
          items.map((i) => {
            const stock = stockByItem.get(i.id) ?? 0;
            return (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{i.name}</p>
                  <p className="text-xs text-zinc-500">
                    Stok di {location.name}: {stock} {i.unit}
                  </p>
                </div>
                <AdjustStockForm
                  itemName={i.name}
                  currentStock={stock}
                  unit={i.unit}
                  action={adjustSemiFinishedLocationStock.bind(null, businessId, locationId, i.id)}
                />
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada bahan setengah jadi — tambahkan dulu di halaman Bahan Setengah Jadi.
          </p>
        )}
      </div>

      {adjustments && adjustments.length > 0 && (
        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            Riwayat Penyesuaian Stok — {location.name}
          </h2>
          <div className="space-y-2">
            {adjustments.map((a) => (
              <div key={a.id} className="border-b border-zinc-100 pb-2 text-xs last:border-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-zinc-800">{a.item_name}</p>
                  <p
                    className={
                      Number(a.diff) > 0 ? "font-semibold text-brand-600" : "font-semibold text-red-500"
                    }
                  >
                    {Number(a.diff) > 0 ? "+" : ""}
                    {a.diff} {a.unit}
                  </p>
                </div>
                <p className="text-zinc-500">
                  {a.stock_before} → {a.stock_after} {a.unit} · {a.reason} ·{" "}
                  {new Date(a.created_at).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
