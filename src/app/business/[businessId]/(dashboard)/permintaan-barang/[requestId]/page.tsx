import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";
import DeliveryNoteForm from "./delivery-note-form";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BUDGET_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Verifikasi Anggaran",
  approved_in_budget: "APPROVED IN BUDGET",
  rejected: "Ditolak (Di Luar Budget)",
};

export default async function PurchaseRequisitionPrintPage({
  params,
}: {
  params: Promise<{ businessId: string; requestId: string }>;
}) {
  const { businessId, requestId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("name, procurement_budget_gate_enabled")
    .eq("id", businessId)
    .single();
  if (!business) notFound();

  const { data: request } = await supabase
    .from("purchase_requests")
    .select("id, pr_number, employee_name, location_id, note, created_at")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .single();
  if (!request) notFound();

  const [{ data: items }, { data: location }] = await Promise.all([
    supabase
      .from("purchase_request_items")
      .select(
        "id, item_name, unit, qty_ordered, approved_qty, budget_status, budget_approved_by, budget_approved_at, budget_note, fulfillment_source",
      )
      .eq("purchase_request_id", requestId)
      .eq("business_id", businessId)
      .order("id", { ascending: true }),
    request.location_id
      ? supabase.from("stock_locations").select("name").eq("id", request.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const showBudgetGate = business.procurement_budget_gate_enabled ?? false;
  const rows = items ?? [];
  const rejectedRows = rows.filter((it) => it.budget_status === "rejected" && it.budget_note);

  // Surat Jalan -- kumpulkan barang yang "siap dikirim" (sudah ditandai
  // ambil dari Gudang, atau sudah diterima lewat GRN dengan condition OK)
  // tapi belum pernah masuk Surat Jalan manapun (lihat delivery-note-actions.ts).
  const stockItemIds = rows.filter((it) => it.fulfillment_source === "stock").map((it) => it.id);
  const supplierItemIds = rows.filter((it) => it.fulfillment_source === "supplier").map((it) => it.id);
  const prItemById = new Map(rows.map((it) => [it.id, it]));

  type EligibleItem = {
    sourceType: "stock_fulfillment" | "grn_item";
    sourceId: string;
    itemName: string;
    unit: string;
    qty: number;
    sourceLabel: string;
  };
  let eligibleItems: EligibleItem[] = [];
  let employees: { id: string; name: string }[] = [];
  let deliveryNotes: { id: string; dn_number: string; to_location_name: string; prepared_by: string; created_at: string; itemCount: number }[] = [];

  if (stockItemIds.length > 0 || supplierItemIds.length > 0) {
    const [{ data: employeeRows }, { data: fulfillments }, { data: allocations }] = await Promise.all([
      supabase.from("employees").select("id, name").eq("business_id", businessId).eq("active", true).order("name"),
      stockItemIds.length > 0
        ? supabase
            .from("purchase_request_item_stock_fulfillments")
            .select("id, purchase_request_item_id, qty")
            .eq("business_id", businessId)
            .in("purchase_request_item_id", stockItemIds)
        : Promise.resolve({ data: [] }),
      supplierItemIds.length > 0
        ? supabase
            .from("purchase_request_item_allocations")
            .select("id, purchase_request_item_id")
            .eq("business_id", businessId)
            .in("purchase_request_item_id", supplierItemIds)
        : Promise.resolve({ data: [] }),
    ]);
    employees = employeeRows ?? [];

    let grnItems: { id: string; qty_received: number; purchase_order_item_id: string; item_name: string; unit: string }[] = [];
    if ((allocations ?? []).length > 0) {
      const allocationIds = (allocations ?? []).map((a) => a.id);
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("id, item_name, unit, allocation_id")
        .in("allocation_id", allocationIds);
      const poItemById = new Map((poItems ?? []).map((p) => [p.id, p]));
      const poItemIds = (poItems ?? []).map((p) => p.id);
      if (poItemIds.length > 0) {
        const { data: grnRows } = await supabase
          .from("goods_receipt_note_items")
          .select("id, qty_received, purchase_order_item_id")
          .in("purchase_order_item_id", poItemIds)
          .eq("condition", "ok");
        grnItems = (grnRows ?? []).map((g) => {
          const poItem = poItemById.get(g.purchase_order_item_id);
          return {
            id: g.id,
            qty_received: Number(g.qty_received),
            purchase_order_item_id: g.purchase_order_item_id,
            item_name: poItem?.item_name ?? "(barang)",
            unit: poItem?.unit ?? "",
          };
        });
      }
    }

    const candidateSourceIds = [...(fulfillments ?? []).map((f) => f.id), ...grnItems.map((g) => g.id)];
    let usedSourceIds = new Set<string>();
    if (candidateSourceIds.length > 0) {
      const { data: usedRows } = await supabase
        .from("delivery_note_items")
        .select("source_id")
        .eq("business_id", businessId)
        .in("source_id", candidateSourceIds);
      usedSourceIds = new Set((usedRows ?? []).map((u) => u.source_id));
    }

    eligibleItems = [
      ...(fulfillments ?? [])
        .filter((f) => !usedSourceIds.has(f.id))
        .map((f) => {
          const prItem = prItemById.get(f.purchase_request_item_id);
          return {
            sourceType: "stock_fulfillment" as const,
            sourceId: f.id,
            itemName: prItem?.item_name ?? "(barang)",
            unit: prItem?.unit ?? "",
            qty: Number(f.qty),
            sourceLabel: "Ambil Gudang",
          };
        }),
      ...grnItems
        .filter((g) => !usedSourceIds.has(g.id))
        .map((g) => ({
          sourceType: "grn_item" as const,
          sourceId: g.id,
          itemName: g.item_name,
          unit: g.unit,
          qty: g.qty_received,
          sourceLabel: "Dari Supplier",
        })),
    ];

    const { data: dnRows } = await supabase
      .from("delivery_notes")
      .select("id, dn_number, to_location_name, prepared_by, created_at")
      .eq("purchase_request_id", requestId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if ((dnRows ?? []).length > 0) {
      const dnIds = (dnRows ?? []).map((d) => d.id);
      const { data: dnItemRows } = await supabase.from("delivery_note_items").select("delivery_note_id").in("delivery_note_id", dnIds);
      const countByDn = new Map<string, number>();
      for (const r of dnItemRows ?? []) {
        countByDn.set(r.delivery_note_id, (countByDn.get(r.delivery_note_id) ?? 0) + 1);
      }
      deliveryNotes = (dnRows ?? []).map((d) => ({ ...d, itemCount: countByDn.get(d.id) ?? 0 }));
    }
  }

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="print:hidden">
        <p className="text-xs font-medium text-zinc-400">{business.name}</p>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">PURCHASE REQUISITION (PR)</h1>
            <p className="text-xs text-zinc-400">{request.pr_number ?? "—"}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-zinc-400">Diajukan oleh</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{request.employee_name}</p>
            {location && (
              <>
                <p className="mt-1 text-zinc-400">Lokasi</p>
                <p className="mt-0.5 font-semibold text-zinc-900">{location.name}</p>
              </>
            )}
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Tanggal Pengajuan</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{formatDateTime(request.created_at)}</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Barang</th>
                <th className="px-3 py-2 text-right font-medium">Qty Diajukan</th>
                <th className="px-3 py-2 text-right font-medium">Qty Disetujui</th>
                {showBudgetGate && <th className="px-3 py-2 text-right font-medium">Status Budget</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 text-zinc-700">{it.item_name}</td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {Number(it.qty_ordered)} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-900">
                    {it.approved_qty !== null ? `${Number(it.approved_qty)} ${it.unit ?? ""}` : "—"}
                  </td>
                  {showBudgetGate && (
                    <td className="px-3 py-2 text-right text-zinc-500">
                      {BUDGET_STATUS_LABEL[it.budget_status] ?? it.budget_status}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {request.note && (
          <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">Catatan: {request.note}</p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-zinc-400">Diajukan oleh</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">{request.employee_name}</p>
          </div>
          {showBudgetGate && (
            <div>
              <p className="text-zinc-400">Verifikasi & Otorisasi Anggaran — Cost Control</p>
              <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">
                {rows.find((it) => it.budget_approved_by)?.budget_approved_by ?? "________________"}
              </p>
              {rows.find((it) => it.budget_approved_at)?.budget_approved_at && (
                <p className="text-[10px] text-zinc-400">
                  {formatDateTime(rows.find((it) => it.budget_approved_at)!.budget_approved_at!)}
                </p>
              )}
            </div>
          )}
        </div>
        {showBudgetGate && rejectedRows.length > 0 && (
          <div className="mt-3 space-y-1">
            {rejectedRows.map((it) => (
              <p key={it.id} className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {it.item_name} ditolak oleh {it.budget_approved_by}: {it.budget_note}
              </p>
            ))}
          </div>
        )}
      </div>

      {eligibleItems.length > 0 && (
        <DeliveryNoteForm
          businessId={businessId}
          requestId={requestId}
          employees={employees}
          eligibleItems={eligibleItems}
        />
      )}

      {deliveryNotes.length > 0 && (
        <div className="mt-4 rounded-xl bg-white shadow-sm p-4 print:hidden">
          <h2 className="text-sm font-semibold text-zinc-900">Riwayat Surat Jalan</h2>
          <div className="mt-2 space-y-2">
            {deliveryNotes.map((dn) => (
              <Link
                key={dn.id}
                href={`/business/${businessId}/permintaan-barang/${requestId}/surat-jalan/${dn.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-xs hover:bg-zinc-50"
              >
                <div>
                  <p className="font-medium text-zinc-800">{dn.dn_number}</p>
                  <p className="text-[10px] text-zinc-400">
                    Ke {dn.to_location_name} · Disiapkan oleh {dn.prepared_by} · {formatDateTime(dn.created_at)}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                  {dn.itemCount} barang
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <PrintButton businessId={businessId} />
      </div>
    </div>
  );
}
