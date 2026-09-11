import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";
import TransferForm from "./transfer-form";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TransferRow = {
  id: string;
  transfer_number: string;
  from_location_id: string;
  to_location_id: string;
  note: string | null;
  sent_by_name: string;
  created_at: string;
};
type TransferItemRow = {
  transfer_id: string;
  item_name: string;
  unit: string;
  qty: number;
};

export default async function TransferBahanBakuPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !hasStockLocationAccess(business)) notFound();

  const [{ data: locations }, transferRows] = await Promise.all([
    supabase
      .from("stock_locations")
      .select("id, name, warehouse_mode")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: true }),
    fetchAllRows<TransferRow>((from, to) =>
      supabase
        .from("ingredient_location_transfers")
        .select("id, transfer_number, from_location_id, to_location_id, note, sent_by_name, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  // Lokasi Gudang mode "standalone" (barang berdiri sendiri, lihat migrasi
  // warehouse_standalone_mode) tidak pernah punya ingredient_location_stock
  // -- disembunyikan dari picker biar tidak bingung ("kok Gudang kosong").
  const locationList = (locations ?? []).filter((l) => l.warehouse_mode !== "standalone");
  const nameByLocation = new Map((locations ?? []).map((l) => [l.id, l.name]));

  const transferIds = transferRows.map((t) => t.id);
  const itemRows =
    transferIds.length > 0
      ? await fetchAllRows<TransferItemRow>((from, to) =>
          supabase
            .from("ingredient_location_transfer_items")
            .select("transfer_id, item_name, unit, qty")
            .in("transfer_id", transferIds)
            .range(from, to),
        )
      : [];
  const itemsByTransfer = new Map<string, TransferItemRow[]>();
  for (const it of itemRows) {
    const list = itemsByTransfer.get(it.transfer_id) ?? [];
    list.push(it);
    itemsByTransfer.set(it.transfer_id, list);
  }

  // Stok per lokasi -- buat item picker di form. Query terpisah (bukan embed
  // ingredients(...)) karena ingredient_location_stock belum terdaftar
  // relationship-nya di tipe database.ts.
  const [stockRows, ingredientRows] = await Promise.all([
    fetchAllRows<{ location_id: string; ingredient_id: string; stock: number }>((from, to) =>
      supabase
        .from("ingredient_location_stock")
        .select("location_id, ingredient_id, stock")
        .eq("business_id", businessId)
        .gt("stock", 0)
        .range(from, to),
    ),
    fetchAllRows<{ id: string; name: string; unit: string }>((from, to) =>
      supabase
        .from("ingredients")
        .select("id, name, unit")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .range(from, to),
    ),
  ]);
  const ingredientById = new Map(ingredientRows.map((i) => [i.id, i]));
  const stockByLocation: Record<string, { ingredientId: string; name: string; unit: string; stock: number }[]> = {};
  for (const r of stockRows) {
    const ingredient = ingredientById.get(r.ingredient_id);
    const list = stockByLocation[r.location_id] ?? [];
    list.push({
      ingredientId: r.ingredient_id,
      name: ingredient?.name ?? "—",
      unit: ingredient?.unit ?? "",
      stock: Number(r.stock),
    });
    stockByLocation[r.location_id] = list;
  }
  for (const list of Object.values(stockByLocation)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Transfer Bahan Baku — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Pindahkan stok bahan baku antar-lokasi (mis. Gudang → Kitchen/Bar) dalam toko ini.
      </p>

      <div className="mt-4">
        <TransferForm businessId={businessId} locations={locationList} stockByLocation={stockByLocation} />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-zinc-900">Riwayat ({transferRows.length})</h2>
        {transferRows.length > 0 ? (
          <div className="space-y-2">
            {transferRows.map((r) => (
              <div key={r.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900">
                    {r.transfer_number} — {nameByLocation.get(r.from_location_id) ?? "—"} →{" "}
                    {nameByLocation.get(r.to_location_id) ?? "—"}
                  </p>
                  <p className="shrink-0 text-[11px] text-zinc-400">{formatDateTime(r.created_at)}</p>
                </div>
                <p className="text-[11px] text-zinc-400">
                  oleh {r.sent_by_name}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
                {(itemsByTransfer.get(r.id) ?? []).length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-600">
                    {(itemsByTransfer.get(r.id) ?? []).map((it, idx) => (
                      <li key={idx}>
                        • {it.item_name} — {it.qty} {it.unit}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum pernah transfer bahan baku antar-lokasi.
          </p>
        )}
      </div>
    </div>
  );
}
