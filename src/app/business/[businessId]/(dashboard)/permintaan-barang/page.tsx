import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { regeneratePurchaseRequestSlug } from "./actions";
import PurchaseRequestLinkSection from "./link-section";
import RequestCard from "./request-card";

type ItemRow = {
  id: string;
  purchase_request_id: string;
  item_type: "ingredient" | "product";
  ingredient_id: string | null;
  product_id: string | null;
  item_name: string;
  unit: string | null;
  qty_ordered: number;
  current_stock: number | null;
  approved_qty: number | null;
};

type AllocationRow = {
  id: string;
  purchase_request_item_id: string;
  supplier_id: string | null;
  qty: number;
  forwarded_at: string | null;
  received_at: string | null;
  purchase_id: string | null;
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

  const [{ data: suppliers }, { data: requests }, { data: items }, { data: allocations }, { data: ingredients }] =
    await Promise.all([
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
          "id, purchase_request_id, item_type, ingredient_id, product_id, item_name, unit, qty_ordered, current_stock, approved_qty",
        )
        .eq("business_id", businessId),
      supabase
        .from("purchase_request_item_allocations")
        .select("id, purchase_request_item_id, supplier_id, qty, forwarded_at, received_at, purchase_id")
        .eq("business_id", businessId),
      supabase.from("ingredients").select("id, department").eq("business_id", businessId),
    ]);

  const departmentByIngredient = new Map((ingredients ?? []).map((i) => [i.id, i.department]));

  const allocationsByItem = new Map<string, AllocationRow[]>();
  for (const a of (allocations ?? []) as AllocationRow[]) {
    const list = allocationsByItem.get(a.purchase_request_item_id) ?? [];
    list.push(a);
    allocationsByItem.set(a.purchase_request_item_id, list);
  }

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
        Order barang dari staf dapur/bar/front — terima, alokasikan ke supplier, teruskan.
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
            businessId={businessId}
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
                  itemType: it.item_type,
                  ingredientId: it.ingredient_id,
                  productId: it.product_id,
                  department: it.ingredient_id ? (departmentByIngredient.get(it.ingredient_id) ?? null) : null,
                  unit: it.unit,
                  qtyOrdered: Number(it.qty_ordered),
                  currentStock: it.current_stock !== null ? Number(it.current_stock) : null,
                  approvedQty: it.approved_qty !== null ? Number(it.approved_qty) : null,
                  allocations: (allocationsByItem.get(it.id) ?? []).map((a) => ({
                    id: a.id,
                    supplierId: a.supplier_id,
                    qty: Number(a.qty),
                    forwardedAt: a.forwarded_at,
                    receivedAt: a.received_at,
                    purchaseId: a.purchase_id,
                  })),
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
