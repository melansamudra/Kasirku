import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";
import ApproveForm from "./approve-form";

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

      <div className="mt-4">
        <PrintButton businessId={businessId} />
      </div>
    </div>
  );
}
