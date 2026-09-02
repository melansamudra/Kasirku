import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { getCurrentActor, canApprovePo } from "@/lib/current-actor";
import { regeneratePurchaseRequestSlug } from "./actions";
import PurchaseRequestLinkSection from "./link-section";
import RequestCard from "./request-card";
import TransferRequestCard from "./transfer-request-card";

function formatRupiah(value: number) {
  return value.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
}

// Kunci tanggal buat pengelompokan Ringkasan per Tanggal -- dikonversi ke
// zona Jakarta dulu (server bisa jalan di UTC), format en-CA (YYYY-MM-DD)
// biar sortable sebagai string biasa.
function jakartaDateKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function formatDateLabel(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

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

type PoItemLinkRow = { id: string; allocation_id: string; purchase_order_id: string; unit: string };
type PoStatusRow = { id: string; status: string };
type GrnOkQtyRow = { purchase_order_item_id: string; qty_received: number };

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

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  purchase_request_id: string | null;
  status: string;
  total_amount: number;
  created_at: string;
};

type TransferRow = {
  id: string;
  from_location_id: string;
  to_location_id: string;
  requested_by_name: string;
  note: string | null;
  status: string;
  created_at: string;
  dn_number: string | null;
};
type TransferItemRow = { id: string; transfer_id: string; item_name: string; unit: string; qty_requested: number; qty_sent: number | null };

// Baris gabungan buat 1 list yang sama -- purchase_requests (ke Purchasing)
// dan location_transfers (Bahan Setengah Jadi ke Dapur Produksi) itu 2
// sistem/tabel TERPISAH TOTAL (beda alur kerja: PR butuh alokasi
// supplier/budget, Transfer cuma 1x kirim tuntas) -- digabung di level
// TAMPILAN saja (disortir bareng by tanggal, dikasih label sumbernya),
// bukan digabung skemanya (arahan user 2026-08-29).
type MergedRow = { kind: "pr"; createdAt: string; data: RequestRow } | { kind: "transfer"; createdAt: string; data: TransferRow };

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

  const actor = await getCurrentActor(supabase, businessId);
  const canApproveBudget = actor ? canApprovePo(actor) : false;

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
    { data: transfers },
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
    supabase.from("stock_locations").select("id, name, is_production, portal_slug").eq("business_id", businessId),
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
    supabase
      .from("location_transfers")
      .select("id, from_location_id, to_location_id, requested_by_name, note, status, created_at, dn_number")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const dapurProduksi = (locations ?? []).find((l) => l.is_production);
  const transferRows = (transfers ?? []) as TransferRow[];
  const transferIds = transferRows.map((t) => t.id);
  const { data: transferItems } = transferIds.length > 0
    ? await supabase
        .from("location_transfer_items")
        .select("id, transfer_id, item_name, unit, qty_requested, qty_sent")
        .in("transfer_id", transferIds)
    : { data: [] as TransferItemRow[] };
  const transferItemsByTransfer = new Map<string, TransferItemRow[]>();
  for (const it of (transferItems ?? []) as TransferItemRow[]) {
    const list = transferItemsByTransfer.get(it.transfer_id) ?? [];
    list.push(it);
    transferItemsByTransfer.set(it.transfer_id, list);
  }

  const requestIds = (requests ?? []).map((r) => r.id);
  const { data: purchaseOrders } = requestIds.length > 0
    ? await supabase
        .from("purchase_orders")
        .select("id, po_number, supplier_id, purchase_request_id, status, total_amount, created_at")
        .eq("business_id", businessId)
        .in("purchase_request_id", requestIds)
    : { data: [] as PurchaseOrderRow[] };

  const posByRequest = new Map<string, PurchaseOrderRow[]>();
  for (const po of (purchaseOrders ?? []) as PurchaseOrderRow[]) {
    if (!po.purchase_request_id) continue;
    const list = posByRequest.get(po.purchase_request_id) ?? [];
    list.push(po);
    posByRequest.set(po.purchase_request_id, list);
  }

  // GRN Fase 2 (2026-08-29) -- barang lewat jalur supplier sekarang punya PO,
  // dan PO punya GRN sendiri (qty diterima OK vs Rusak, lihat
  // goods_receipt_note_items). Sebelumnya "Catat sebagai Pembelian" dibuka
  // oleh tombol "Tandai Barang Datang" yang terpisah total dari GRN --
  // sekarang disambungkan: allocation yang punya PO pakai status PO+GRN buat
  // nentuin kapan siap dicatat, bukan flip manual lagi. Allocation TANPA PO
  // (bisnis non-cost-control, atau data lama) tetap pakai `received_at`
  // seperti sebelumnya -- map ini cuma diisi kalau memang ada PO.
  const allocationIds = (allocations ?? []).map((a) => a.id);
  const poLinkByAllocation = new Map<string, { poId: string; poStatus: string; grnOkQty: number; unit: string }>();
  if (allocationIds.length > 0) {
    const { data: poItems } = await supabase
      .from("purchase_order_items")
      .select("id, allocation_id, purchase_order_id, unit")
      .in("allocation_id", allocationIds);
    const poItemRows = (poItems ?? []) as PoItemLinkRow[];

    if (poItemRows.length > 0) {
      const poIds = [...new Set(poItemRows.map((p) => p.purchase_order_id))];
      const poItemIds = poItemRows.map((p) => p.id);
      const [{ data: poStatusRows }, { data: grnRows }] = await Promise.all([
        supabase.from("purchase_orders").select("id, status").in("id", poIds),
        supabase
          .from("goods_receipt_note_items")
          .select("purchase_order_item_id, qty_received")
          .in("purchase_order_item_id", poItemIds)
          .eq("condition", "ok"),
      ]);
      const statusByPoId = new Map(((poStatusRows ?? []) as PoStatusRow[]).map((p) => [p.id, p.status]));
      const grnOkQtyByPoItemId = new Map<string, number>();
      for (const g of (grnRows ?? []) as GrnOkQtyRow[]) {
        grnOkQtyByPoItemId.set(
          g.purchase_order_item_id,
          (grnOkQtyByPoItemId.get(g.purchase_order_item_id) ?? 0) + Number(g.qty_received),
        );
      }

      for (const poItem of poItemRows) {
        poLinkByAllocation.set(poItem.allocation_id, {
          poId: poItem.purchase_order_id,
          poStatus: statusByPoId.get(poItem.purchase_order_id) ?? "issued",
          grnOkQty: grnOkQtyByPoItemId.get(poItem.id) ?? 0,
          unit: poItem.unit,
        });
      }
    }
  }

  const departmentByIngredient = new Map((ingredients ?? []).map((i) => [i.id, i.department]));
  const priceByIngredient = new Map((ingredients ?? []).map((i) => [i.id, Number(i.unit_cost)]));
  const priceByProduct = new Map((products ?? []).map((p) => [p.id, Number(p.cost)]));
  const locationNameById = new Map((locations ?? []).map((l) => [l.id, l.name]));

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

  const estimatedValueByRequestId = new Map<string, number>();
  for (const [requestId, reqItems] of itemsByRequest) {
    const value = reqItems.reduce((sum, it) => {
      const price = it.ingredient_id
        ? (priceByIngredient.get(it.ingredient_id) ?? 0)
        : it.product_id
          ? (priceByProduct.get(it.product_id) ?? 0)
          : 0;
      return sum + price * Number(it.qty_ordered);
    }, 0);
    estimatedValueByRequestId.set(requestId, value);
  }

  const allRows = (requests ?? []) as RequestRow[];
  const rows = filterLocationId ? allRows.filter((r) => r.location_id === filterLocationId) : allRows;
  const filteredTransfers = filterLocationId
    ? transferRows.filter((t) => t.to_location_id === filterLocationId)
    : transferRows;
  const baruCount =
    rows.filter((r) => r.status === "baru").length + filteredTransfers.filter((t) => t.status === "baru").length;
  const activeLocationName = filterLocationId
    ? (locations ?? []).find((l) => l.id === filterLocationId)?.name
    : null;

  const mergedRows: MergedRow[] = [
    ...rows.map((r): MergedRow => ({ kind: "pr", createdAt: r.created_at, data: r })),
    ...filteredTransfers.map((t): MergedRow => ({ kind: "transfer", createdAt: t.created_at, data: t })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Ringkasan per Tanggal -- Owner minta rekap volume order harian (2026-08-29),
  // dihitung dari data yang sama yang sudah dimuat (50 PR + 50 transfer
  // terakhir, ikut filter lokasi kalau aktif) -- bukan query terpisah.
  const summaryByDate = new Map<string, { prCount: number; transferCount: number; totalValue: number }>();
  for (const row of mergedRows) {
    const key = jakartaDateKey(row.createdAt);
    const entry = summaryByDate.get(key) ?? { prCount: 0, transferCount: 0, totalValue: 0 };
    if (row.kind === "pr") {
      entry.prCount += 1;
      entry.totalValue += estimatedValueByRequestId.get(row.data.id) ?? 0;
    } else {
      entry.transferCount += 1;
    }
    summaryByDate.set(key, entry);
  }
  const summaryDates = [...summaryByDate.keys()].sort((a, b) => b.localeCompare(a));

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

      {summaryDates.length > 0 && (
        <div className="mt-4 rounded-xl bg-white shadow-sm p-4">
          <h2 className="text-sm font-semibold text-zinc-900">📅 Ringkasan per Tanggal</h2>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            {business.cost_control_enabled
              ? `Dari ${mergedRows.length} order yang lagi dimuat di bawah (maksimal 50 PR + 50 BSJ terakhir).`
              : `Dari ${rows.length} order yang lagi dimuat di bawah (maksimal 50 terakhir).`}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-zinc-400">
                <tr className="border-b border-zinc-100">
                  <th className="py-1.5 pr-3 text-left font-medium">Tanggal</th>
                  <th className="px-3 py-1.5 text-right font-medium">
                    {business.cost_control_enabled ? "🛒 Ke Purchasing" : "Jumlah PR"}
                  </th>
                  {business.cost_control_enabled && (
                    <th className="px-3 py-1.5 text-right font-medium">🥡 Ke Dapur Produksi</th>
                  )}
                  <th className="py-1.5 pl-3 text-right font-medium">Estimasi Nilai PR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {summaryDates.map((dateKey) => {
                  const s = summaryByDate.get(dateKey)!;
                  return (
                    <tr key={dateKey}>
                      <td className="py-1.5 pr-3 text-zinc-700">{formatDateLabel(dateKey)}</td>
                      <td className="px-3 py-1.5 text-right text-zinc-600">{s.prCount || "—"}</td>
                      {business.cost_control_enabled && (
                        <td className="px-3 py-1.5 text-right text-zinc-600">{s.transferCount || "—"}</td>
                      )}
                      <td className="py-1.5 pl-3 text-right font-medium text-zinc-900">
                        {s.totalValue > 0 ? formatRupiah(s.totalValue) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">
            {filterLocationId ? `Link Order Barang — ${activeLocationName}` : "Link Order Barang"}
          </h2>
          <Link
            href={`/business/${businessId}/permintaan-barang/buat${filterLocationId ? `?lokasi=${filterLocationId}` : ""}`}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            + Buat Permintaan Barang
          </Link>
        </div>
        {!filterLocationId && (
          <p className="mt-1 text-xs text-zinc-500">
            Bagikan link ini ke staf dapur/bar/front supaya bisa kirim order tanpa login — atau kalau
            sudah login, langsung pakai tombol &quot;+ Buat Permintaan Barang&quot; di atas.
          </p>
        )}
        <div className="mt-3">
          <PurchaseRequestLinkSection
            businessId={businessId}
            initialSlug={business.purchase_request_slug ?? ""}
            regenerateAction={boundRegenerateSlug}
            lockedLocation={
              filterLocationId && activeLocationName ? { id: filterLocationId, name: activeLocationName } : null
            }
            hideGeneralLink={Boolean(filterLocationId)}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {mergedRows.length > 0 ? (
          mergedRows.map((row) => {
            if (row.kind === "transfer") {
              const t = row.data;
              const tItems = transferItemsByTransfer.get(t.id) ?? [];
              return (
                <TransferRequestCard
                  key={`transfer-${t.id}`}
                  businessId={businessId}
                  dapurProduksiLocationId={dapurProduksi?.id ?? ""}
                  dapurProduksiPortalSlug={dapurProduksi?.portal_slug ?? null}
                  transfer={{
                    id: t.id,
                    requestedByName: t.requested_by_name,
                    toLocationName: locationNameById.get(t.to_location_id) ?? "—",
                    status: t.status as "baru" | "dikirim",
                    note: t.note,
                    createdAt: t.created_at,
                    dnNumber: t.dn_number,
                    items: tItems.map((it) => ({
                      id: it.id,
                      itemName: it.item_name,
                      unit: it.unit,
                      qtyRequested: Number(it.qty_requested),
                      qtySent: it.qty_sent !== null ? Number(it.qty_sent) : null,
                    })),
                  }}
                />
              );
            }

            const r = row.data;
            const reqItems = itemsByRequest.get(r.id) ?? [];
            const estimatedValue = estimatedValueByRequestId.get(r.id) ?? 0;
            return (
            <RequestCard
              key={r.id}
              businessId={businessId}
              businessName={business.name}
              suppliers={suppliers ?? []}
              employees={employees ?? []}
              costControlEnabled={business.cost_control_enabled ?? false}
              procurementBudgetGateEnabled={procurementBudgetGateEnabled}
              currentActorName={actor?.name ?? null}
              canApproveBudget={canApproveBudget}
              purchaseOrders={(posByRequest.get(r.id) ?? []).map((po) => ({
                id: po.id,
                poNumber: po.po_number,
                supplierId: po.supplier_id,
                status: po.status,
                totalAmount: Number(po.total_amount),
                createdAt: po.created_at,
              }))}
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
                    allocations: (allocationsByItem.get(it.id) ?? []).map((a) => {
                      const poLink = poLinkByAllocation.get(a.id);
                      return {
                        id: a.id,
                        supplierId: a.supplier_id,
                        qty: Number(a.qty),
                        forwardedAt: a.forwarded_at,
                        receivedAt: a.received_at,
                        purchaseId: a.purchase_id,
                        poId: poLink?.poId ?? null,
                        poStatus: poLink?.poStatus ?? null,
                        grnOkQty: poLink?.grnOkQty ?? null,
                      };
                    }),
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
