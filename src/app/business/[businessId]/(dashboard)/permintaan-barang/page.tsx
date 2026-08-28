import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
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
  budget_status: string;
  budget_approved_by: string | null;
  budget_note: string | null;
  fulfillment_source: "pending" | "stock" | "supplier";
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

type FulfillmentRow = {
  id: string;
  purchase_request_item_id: string;
  qty: number;
  marked_at: string;
  received_at: string | null;
};

type RequestRow = {
  id: string;
  employee_name: string;
  location_id: string | null;
  status: "baru" | "diterima" | "diteruskan";
  note: string | null;
  created_at: string;
  pr_number: string | null;
};

export default async function PermintaanBarangPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ lokasi?: string }>;
}) {
  const { businessId } = await params;
  const { lokasi: filterLocationId } = await searchParams;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, purchase_request_slug, cost_control_enabled, procurement_budget_gate_enabled")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const [
    { data: suppliers },
    { data: requests },
    { data: items },
    { data: allocations },
    { data: ingredients },
    { data: products },
    { data: locations },
    { data: employees },
    fulfillments,
    stockRows,
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, phone")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("purchase_requests")
      .select("id, employee_name, location_id, status, note, created_at, pr_number")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("purchase_request_items")
      .select(
        "id, purchase_request_id, item_type, ingredient_id, product_id, item_name, unit, qty_ordered, current_stock, approved_qty, budget_status, budget_approved_by, budget_note, fulfillment_source",
      )
      .eq("business_id", businessId),
    supabase
      .from("purchase_request_item_allocations")
      .select("id, purchase_request_item_id, supplier_id, qty, forwarded_at, received_at, purchase_id")
      .eq("business_id", businessId),
    supabase.from("ingredients").select("id, department, unit_cost").eq("business_id", businessId),
    supabase.from("products").select("id, cost").eq("business_id", businessId),
    supabase.from("stock_locations").select("id, name, is_production").eq("business_id", businessId),
    supabase.from("employees").select("id, name").eq("business_id", businessId).eq("active", true).order("name"),
    fetchAllRows<FulfillmentRow>((from, to) =>
      supabase
        .from("purchase_request_item_stock_fulfillments")
        .select("id, purchase_request_item_id, qty, marked_at, received_at")
        .eq("business_id", businessId)
        .range(from, to),
    ),
    fetchAllRows<{ ingredient_id: string; stock: number }>((from, to) =>
      supabase
        .from("ingredient_location_stock")
        .select("ingredient_id, stock")
        .eq("business_id", businessId)
        .range(from, to),
    ),
  ]);

  const departmentByIngredient = new Map((ingredients ?? []).map((i) => [i.id, i.department]));
  const priceByIngredient = new Map((ingredients ?? []).map((i) => [i.id, Number(i.unit_cost)]));
  const priceByProduct = new Map((products ?? []).map((p) => [p.id, Number(p.cost)]));
  const locationNameById = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const productionLocation = (locations ?? []).find((l) => l.is_production);

  const totalStockByIngredient = new Map<string, number>();
  for (const row of stockRows) {
    totalStockByIngredient.set(row.ingredient_id, (totalStockByIngredient.get(row.ingredient_id) ?? 0) + Number(row.stock));
  }

  const allocationsByItem = new Map<string, AllocationRow[]>();
  for (const a of (allocations ?? []) as AllocationRow[]) {
    const list = allocationsByItem.get(a.purchase_request_item_id) ?? [];
    list.push(a);
    allocationsByItem.set(a.purchase_request_item_id, list);
  }

  const fulfillmentByItem = new Map<string, FulfillmentRow>();
  for (const f of fulfillments) {
    fulfillmentByItem.set(f.purchase_request_item_id, f);
  }

  const itemsByRequest = new Map<string, ItemRow[]>();
  for (const it of (items ?? []) as ItemRow[]) {
    const list = itemsByRequest.get(it.purchase_request_id) ?? [];
    list.push(it);
    itemsByRequest.set(it.purchase_request_id, list);
  }

  const allRows = (requests ?? []) as RequestRow[];
  const rows = filterLocationId ? allRows.filter((r) => r.location_id === filterLocationId) : allRows;
  const baruCount = rows.filter((r) => r.status === "baru").length;
  const activeLocationName = filterLocationId
    ? (locations ?? []).find((l) => l.id === filterLocationId)?.name
    : null;

  const boundRegenerateSlug = regeneratePurchaseRequestSlug.bind(null, businessId);
  const procurementBudgetGateEnabled = business.procurement_budget_gate_enabled ?? false;

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">
        Permintaan Barang{activeLocationName ? ` — ${activeLocationName}` : ""} — {business.name}
      </h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Order barang dari staf dapur/bar/front — terima, alokasikan ke supplier, teruskan.
      </p>

      {filterLocationId ? (
        // Datang dari link khusus 1 lokasi (sidebar Dapur Produksi dkk) --
        // tidak usah tampilkan tab lokasi lain, cukup jalan keluar kalau
        // sewaktu-waktu mau lihat gabungan semua lokasi.
        <div className="mt-3">
          <Link
            href={`/business/${businessId}/permintaan-barang`}
            className="text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline"
          >
            ← Lihat semua lokasi
          </Link>
        </div>
      ) : (
        (locations ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Link
              href={`/business/${businessId}/permintaan-barang`}
              className="rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
            >
              Semua Lokasi
            </Link>
            {(locations ?? []).map((l) => (
              <Link
                key={l.id}
                href={`/business/${businessId}/permintaan-barang?lokasi=${l.id}`}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
              >
                {l.name}
              </Link>
            ))}
          </div>
        )
      )}

      {baruCount > 0 && (
        <p className="mt-2 text-xs font-medium text-amber-600">
          📥 {baruCount} order baru menunggu diterima
        </p>
      )}

      {(!filterLocationId || filterLocationId === productionLocation?.id) && (
        <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">
            {filterLocationId ? `Link Order Barang — ${activeLocationName}` : "Link Order Barang"}
          </h2>
          {!filterLocationId && (
            <p className="mt-1 text-xs text-zinc-500">
              Bagikan link ini ke staf dapur/bar/front supaya bisa kirim order tanpa login.
            </p>
          )}
          <div className="mt-3">
            <PurchaseRequestLinkSection
              businessId={businessId}
              initialSlug={business.purchase_request_slug ?? ""}
              regenerateAction={boundRegenerateSlug}
              productionLocationName={productionLocation?.name}
              hideGeneralLink={Boolean(filterLocationId)}
            />
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {rows.length > 0 ? (
          rows.map((r) => {
            const reqItems = itemsByRequest.get(r.id) ?? [];
            const estimatedValue = reqItems.reduce((sum, it) => {
              const price = it.ingredient_id
                ? (priceByIngredient.get(it.ingredient_id) ?? 0)
                : it.product_id
                  ? (priceByProduct.get(it.product_id) ?? 0)
                  : 0;
              return sum + price * Number(it.qty_ordered);
            }, 0);
            return (
            <RequestCard
              key={r.id}
              businessId={businessId}
              businessName={business.name}
              suppliers={suppliers ?? []}
              employees={employees ?? []}
              costControlEnabled={business.cost_control_enabled ?? false}
              procurementBudgetGateEnabled={procurementBudgetGateEnabled}
              request={{
                id: r.id,
                employeeName: r.employee_name,
                locationName: r.location_id ? (locationNameById.get(r.location_id) ?? null) : null,
                status: r.status,
                note: r.note,
                createdAt: r.created_at,
                prNumber: r.pr_number,
                estimatedValue,
                items: reqItems.map((it) => {
                  const fulfillment = fulfillmentByItem.get(it.id);
                  return {
                    id: it.id,
                    itemName: it.item_name,
                    itemType: it.item_type,
                    ingredientId: it.ingredient_id,
                    productId: it.product_id,
                    department: it.ingredient_id ? (departmentByIngredient.get(it.ingredient_id) ?? null) : null,
                    unit: it.unit,
                    qtyOrdered: Number(it.qty_ordered),
                    currentStock: it.current_stock !== null ? Number(it.current_stock) : null,
                    totalStock: it.ingredient_id ? (totalStockByIngredient.get(it.ingredient_id) ?? 0) : null,
                    approvedQty: it.approved_qty !== null ? Number(it.approved_qty) : null,
                    budgetStatus: it.budget_status,
                    budgetApprovedBy: it.budget_approved_by,
                    budgetNote: it.budget_note,
                    fulfillmentSource: it.fulfillment_source,
                    stockFulfillment: fulfillment
                      ? { qty: Number(fulfillment.qty), markedAt: fulfillment.marked_at, receivedAt: fulfillment.received_at }
                      : null,
                    defaultUnitPrice: it.ingredient_id
                      ? (priceByIngredient.get(it.ingredient_id) ?? 0)
                      : it.product_id
                        ? (priceByProduct.get(it.product_id) ?? 0)
                        : 0,
                    allocations: (allocationsByItem.get(it.id) ?? []).map((a) => ({
                      id: a.id,
                      supplierId: a.supplier_id,
                      qty: Number(a.qty),
                      forwardedAt: a.forwarded_at,
                      receivedAt: a.received_at,
                      purchaseId: a.purchase_id,
                    })),
                  };
                }),
              }}
            />
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada order barang masuk.
          </p>
        )}
      </div>
    </div>
  );
}
