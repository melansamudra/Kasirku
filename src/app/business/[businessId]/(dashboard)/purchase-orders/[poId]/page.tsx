import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";
import ApproveForm from "./approve-form";
import GrnForm from "./grn-form";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

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

const STATUS_LABEL: Record<string, string> = {
  issued: "Menunggu Approval",
  approved: "Approved",
  rejected: "Ditolak",
};

const APPROVAL_THRESHOLD = 5_000_000;

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; poId: string }>;
}) {
  const { businessId, poId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) notFound();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, supplier_id, purchase_request_id, status, total_amount, issued_by, approved_by, approved_at, note, created_at",
    )
    .eq("id", poId)
    .eq("business_id", businessId)
    .single();
  if (!po) notFound();

  const [{ data: items }, { data: supplier }, { data: request }, { data: employees }] = await Promise.all([
    supabase
      .from("purchase_order_items")
      .select("id, item_name, unit, qty, unit_price, subtotal")
      .eq("purchase_order_id", poId)
      .order("id", { ascending: true }),
    po.supplier_id ? supabase.from("suppliers").select("name, phone").eq("id", po.supplier_id).maybeSingle() : Promise.resolve({ data: null }),
    po.purchase_request_id
      ? supabase.from("purchase_requests").select("pr_number").eq("id", po.purchase_request_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("employees").select("id, name").eq("business_id", businessId).eq("active", true).order("name"),
  ]);

  const approvalLabel =
    Number(po.total_amount) >= APPROVAL_THRESHOLD
      ? "Nominal ≥ Rp5.000.000 — Operations Supervisor / Owner"
      : "Nominal < Rp5.000.000 — Finance / Cost Control";

  let grns: { id: string; grn_number: string; received_by: string; created_at: string }[] = [];
  let grnItemsByGrnId = new Map<string, { item_name: string; unit: string; qty_received: number; condition: string; condition_note: string | null }[]>();
  let outstandingItems: { poItemId: string; itemName: string; unit: string; remainingQty: number }[] = [];

  if (po.status === "approved" && (items ?? []).length > 0) {
    const poItemIds = (items ?? []).map((it) => it.id);
    const { data: grnRows } = await supabase
      .from("goods_receipt_notes")
      .select("id, grn_number, received_by, created_at")
      .eq("purchase_order_id", poId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    grns = grnRows ?? [];

    const grnIds = grns.map((g) => g.id);
    const receivedByPoItem = new Map<string, number>();
    if (grnIds.length > 0) {
      const { data: grnItems } = await supabase
        .from("goods_receipt_note_items")
        .select("grn_id, purchase_order_item_id, qty_received, condition, condition_note")
        .in("grn_id", grnIds);

      const poItemById = new Map((items ?? []).map((it) => [it.id, it]));
      for (const gi of grnItems ?? []) {
        const poItem = poItemById.get(gi.purchase_order_item_id);
        const list = grnItemsByGrnId.get(gi.grn_id) ?? [];
        list.push({
          item_name: poItem?.item_name ?? "(barang)",
          unit: poItem?.unit ?? "",
          qty_received: Number(gi.qty_received),
          condition: gi.condition,
          condition_note: gi.condition_note,
        });
        grnItemsByGrnId.set(gi.grn_id, list);

        if (gi.condition === "ok") {
          receivedByPoItem.set(
            gi.purchase_order_item_id,
            (receivedByPoItem.get(gi.purchase_order_item_id) ?? 0) + Number(gi.qty_received),
          );
        }
      }
    }

    outstandingItems = (items ?? [])
      .map((it) => {
        const remaining = Number(it.qty) - (receivedByPoItem.get(it.id) ?? 0);
        return { poItemId: it.id, itemName: it.item_name, unit: it.unit, remainingQty: Math.round(remaining * 100) / 100 };
      })
      .filter((it) => it.remainingQty > 0);
  }

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="print:hidden">
        <p className="text-xs font-medium text-zinc-400">{business.name}</p>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">PURCHASE ORDER (PO)</h1>
            <p className="text-xs text-zinc-400">{po.po_number}</p>
            {request?.pr_number && <p className="text-[10px] text-zinc-400">Dari PR: {request.pr_number}</p>}
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              po.status === "approved"
                ? "bg-brand-50 text-brand-700"
                : po.status === "rejected"
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {STATUS_LABEL[po.status] ?? po.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-zinc-400">Kepada Vendor</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{supplier?.name ?? "—"}</p>
            {supplier?.phone && <p className="text-zinc-500">{supplier.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Tanggal Terbit</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{formatDateTime(po.created_at)}</p>
            <p className="mt-1 text-zinc-400">Diterbitkan oleh</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{po.issued_by ?? "—"}</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Barang</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Harga</th>
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(items ?? []).map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 text-zinc-700">{it.item_name}</td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {Number(it.qty)} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-500">{formatRupiah(Number(it.unit_price))}</td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-900">{formatRupiah(Number(it.subtotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 ml-auto w-full max-w-[220px] space-y-1 text-xs">
          <div className="flex justify-between border-t border-zinc-100 pt-1 text-sm font-bold">
            <span className="text-zinc-900">Total PO</span>
            <span className="text-brand-700">{formatRupiah(Number(po.total_amount))}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-zinc-400">Diterbitkan oleh — Purchasing</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">{po.issued_by ?? "________________"}</p>
          </div>
          <div>
            <p className="text-zinc-400">Otorisasi Formal PO</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">
              {po.approved_by ?? "________________"}
            </p>
            {po.approved_at && <p className="text-[10px] text-zinc-400">{formatDateTime(po.approved_at)}</p>}
          </div>
        </div>
        {po.status === "rejected" && po.note && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Alasan penolakan: {po.note}</p>
        )}
      </div>

      {po.status === "issued" && (
        <ApproveForm businessId={businessId} poId={po.id} employees={employees ?? []} approvalLabel={approvalLabel} />
      )}

      {po.status === "approved" && grns.length > 0 && (
        <div className="mt-4 rounded-xl bg-white shadow-sm p-4 print:hidden">
          <h2 className="text-sm font-semibold text-zinc-900">Riwayat Penerimaan Barang (GRN)</h2>
          <div className="mt-2 space-y-2">
            {grns.map((g) => (
              <div key={g.id} className="rounded-lg border border-zinc-100 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-zinc-800">{g.grn_number}</p>
                  <p className="text-[10px] text-zinc-400">{formatDateTime(g.created_at)}</p>
                </div>
                <p className="text-[11px] text-zinc-500">Diterima oleh {g.received_by}</p>
                <div className="mt-1.5 space-y-1">
                  {(grnItemsByGrnId.get(g.id) ?? []).map((gi, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2">
                      <span className="text-zinc-700">{gi.item_name}</span>
                      <span
                        className={
                          gi.condition === "ok" ? "font-medium text-brand-700" : "font-medium text-red-600"
                        }
                      >
                        {gi.qty_received} {gi.unit} {gi.condition === "ok" ? "— OK" : `— Rusak (${gi.condition_note})`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {po.status === "approved" && outstandingItems.length > 0 && (
        <GrnForm businessId={businessId} poId={po.id} employees={employees ?? []} outstandingItems={outstandingItems} />
      )}

      <div className="mt-4">
        <PrintButton businessId={businessId} />
      </div>
    </div>
  );
}
