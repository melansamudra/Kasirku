import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";

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

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) notFound();

  const { data: request } = await supabase
    .from("purchase_requests")
    .select(
      "id, pr_number, employee_name, location_id, note, created_at, budget_status, budget_approved_by, budget_approved_at, budget_note",
    )
    .eq("id", requestId)
    .eq("business_id", businessId)
    .single();
  if (!request) notFound();

  const [{ data: items }, { data: location }] = await Promise.all([
    supabase
      .from("purchase_request_items")
      .select("id, item_name, unit, qty_ordered, approved_qty")
      .eq("purchase_request_id", requestId)
      .eq("business_id", businessId)
      .order("id", { ascending: true }),
    request.location_id
      ? supabase.from("stock_locations").select("name").eq("id", request.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

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
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            {BUDGET_STATUS_LABEL[request.budget_status] ?? request.budget_status}
          </span>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(items ?? []).map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 text-zinc-700">{it.item_name}</td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {Number(it.qty_ordered)} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-900">
                    {it.approved_qty !== null ? `${Number(it.approved_qty)} ${it.unit ?? ""}` : "—"}
                  </td>
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
          <div>
            <p className="text-zinc-400">Verifikasi & Otorisasi Anggaran — Cost Control</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">
              {request.budget_approved_by ?? "________________"}
            </p>
            {request.budget_approved_at && (
              <p className="text-[10px] text-zinc-400">{formatDateTime(request.budget_approved_at)}</p>
            )}
          </div>
        </div>
        {request.budget_status === "rejected" && request.budget_note && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            Alasan penolakan: {request.budget_note}
          </p>
        )}
      </div>

      <div className="mt-4">
        <PrintButton businessId={businessId} />
      </div>
    </div>
  );
}
