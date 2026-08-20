import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { regeneratePurchaseRequestSlug } from "./actions";
import PurchaseRequestLinkSection from "./link-section";
import RequestCard from "./request-card";

type ItemRow = {
  id: string;
  purchase_request_id: string;
  item_name: string;
  unit: string | null;
  qty_ordered: number;
  current_stock: number | null;
  supplier_id: string | null;
  approved_qty: number | null;
  forwarded_at: string | null;
};

type RequestRow = {
  id: string;
  employee_name: string;
  status: "baru" | "diterima" | "diteruskan";
  note: string | null;
  created_at: string;
};

export default async function PermintaanBarangPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, purchase_request_slug")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const [{ data: suppliers }, { data: requests }, { data: items }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, phone")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("purchase_requests")
      .select("id, employee_name, status, note, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("purchase_request_items")
      .select(
        "id, purchase_request_id, item_name, unit, qty_ordered, current_stock, supplier_id, approved_qty, forwarded_at",
      )
      .eq("business_id", businessId),
  ]);

  const itemsByRequest = new Map<string, ItemRow[]>();
  for (const it of (items ?? []) as ItemRow[]) {
    const list = itemsByRequest.get(it.purchase_request_id) ?? [];
    list.push(it);
    itemsByRequest.set(it.purchase_request_id, list);
  }

  const rows = (requests ?? []) as RequestRow[];
  const baruCount = rows.filter((r) => r.status === "baru").length;

  const boundRegenerateSlug = regeneratePurchaseRequestSlug.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Permintaan Barang — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Order barang dari staf dapur/bar/front — terima, pilih supplier, teruskan.
      </p>

      {baruCount > 0 && (
        <p className="mt-2 text-xs font-medium text-amber-600">
          📥 {baruCount} order baru menunggu diterima
        </p>
      )}

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Link Order Barang</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Bagikan link ini ke staf dapur/bar/front supaya bisa kirim order tanpa login.
        </p>
        <div className="mt-3">
          <PurchaseRequestLinkSection
            initialSlug={business.purchase_request_slug ?? ""}
            regenerateAction={boundRegenerateSlug}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {rows.length > 0 ? (
          rows.map((r) => (
            <RequestCard
              key={r.id}
              businessId={businessId}
              businessName={business.name}
              suppliers={suppliers ?? []}
              request={{
                id: r.id,
                employeeName: r.employee_name,
                status: r.status,
                note: r.note,
                createdAt: r.created_at,
                items: (itemsByRequest.get(r.id) ?? []).map((it) => ({
                  id: it.id,
                  itemName: it.item_name,
                  unit: it.unit,
                  qtyOrdered: Number(it.qty_ordered),
                  currentStock: it.current_stock !== null ? Number(it.current_stock) : null,
                  supplierId: it.supplier_id,
                  approvedQty: it.approved_qty !== null ? Number(it.approved_qty) : null,
                  forwardedAt: it.forwarded_at,
                })),
              }}
            />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada order barang masuk.
          </p>
        )}
      </div>
    </div>
  );
}
