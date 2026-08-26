import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fulfillWarehouseRequest } from "./actions";
import RequestCard from "./request-card";

type WarehouseRequestItemRow = {
  id: string;
  warehouse_request_id: string;
  item_name: string;
  unit: string;
  qty_requested: number;
  qty_fulfilled: number | null;
};

export default async function PermintaanGudangPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: requests } = await supabase
    .from("warehouse_requests")
    .select("id, warehouse_name, employee_name, note, status, reject_reason, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  const requestIds = (requests ?? []).map((r) => r.id);
  let items: WarehouseRequestItemRow[] = [];
  if (requestIds.length > 0) {
    const { data } = await supabase
      .from("warehouse_request_items")
      .select("id, warehouse_request_id, item_name, unit, qty_requested, qty_fulfilled")
      .in("warehouse_request_id", requestIds);
    items = data ?? [];
  }

  const itemsByRequest = new Map<string, WarehouseRequestItemRow[]>();
  for (const item of items) {
    const list = itemsByRequest.get(item.warehouse_request_id) ?? [];
    list.push(item);
    itemsByRequest.set(item.warehouse_request_id, list);
  }

  const rows = (requests ?? []).map((r) => ({ ...r, items: itemsByRequest.get(r.id) ?? [] }));
  const baruCount = rows.filter((r) => r.status === "baru").length;

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Permintaan Gudang — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Permintaan bahan baku dari Gudang Kering/Basah ke Purchasing. Kelola link publiknya di{" "}
        <Link href={`/business/${businessId}/warehouses`} className="text-brand-600 hover:underline">
          halaman Gudang
        </Link>
        .
      </p>

      <div className="mt-6 space-y-3">
        {rows.length > 0 ? (
          rows.map((request) => (
            <RequestCard
              key={request.id}
              businessId={businessId}
              request={request}
              fulfillAction={fulfillWarehouseRequest.bind(null, businessId, request.id)}
            />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada permintaan dari gudang.
          </p>
        )}
      </div>

      {baruCount > 0 && (
        <p className="mt-3 text-center text-xs text-zinc-400">{baruCount} permintaan menunggu diproses.</p>
      )}
    </div>
  );
}
