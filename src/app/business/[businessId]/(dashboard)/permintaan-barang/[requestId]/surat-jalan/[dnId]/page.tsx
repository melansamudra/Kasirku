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

export default async function DeliveryNotePrintPage({
  params,
}: {
  params: Promise<{ businessId: string; requestId: string; dnId: string }>;
}) {
  const { businessId, requestId, dnId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) notFound();

  const { data: dn } = await supabase
    .from("delivery_notes")
    .select("id, dn_number, from_location_id, to_location_name, prepared_by, note, created_at")
    .eq("id", dnId)
    .eq("business_id", businessId)
    .eq("purchase_request_id", requestId)
    .single();
  if (!dn) notFound();

  const [{ data: items }, { data: fromLocation }, { data: request }] = await Promise.all([
    supabase
      .from("delivery_note_items")
      .select("id, item_name, unit, qty")
      .eq("delivery_note_id", dnId)
      .order("id", { ascending: true }),
    supabase.from("stock_locations").select("name").eq("id", dn.from_location_id).maybeSingle(),
    supabase.from("purchase_requests").select("pr_number").eq("id", requestId).maybeSingle(),
  ]);

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="print:hidden">
        <p className="text-xs font-medium text-zinc-400">{business.name}</p>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">SURAT JALAN</h1>
            <p className="text-xs text-zinc-400">{dn.dn_number}</p>
            {request?.pr_number && <p className="text-[10px] text-zinc-400">Dari PR: {request.pr_number}</p>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-zinc-400">Dari</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{fromLocation?.name ?? "—"}</p>
            <p className="mt-1 text-zinc-400">Ke</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{dn.to_location_name}</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Tanggal</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{formatDateTime(dn.created_at)}</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Barang</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(items ?? []).map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 text-zinc-700">{it.item_name}</td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {Number(it.qty)} {it.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {dn.note && <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">Catatan: {dn.note}</p>}

        <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-zinc-400">Disiapkan oleh — Purchasing</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">{dn.prepared_by}</p>
          </div>
          <div>
            <p className="text-zinc-400">Diterima oleh — Unit Usaha</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">________________</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <PrintButton businessId={businessId} requestId={requestId} />
      </div>
    </div>
  );
}
