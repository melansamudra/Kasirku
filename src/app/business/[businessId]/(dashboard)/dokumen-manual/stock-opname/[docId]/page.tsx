import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "../../../lokasi/[locationId]/dokumen-manual/print-button";

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

export default async function StockOpnameManualPrintPageGlobal({
  params,
}: {
  params: Promise<{ businessId: string; docId: string }>;
}) {
  const { businessId, docId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) notFound();

  const { data: doc } = await supabase
    .from("manual_stock_opnames")
    .select("id, opname_number, note, created_by_name, created_at")
    .eq("id", docId)
    .eq("business_id", businessId)
    .is("location_id", null)
    .single();
  if (!doc) notFound();

  const { data: items } = await supabase
    .from("manual_stock_opname_items")
    .select("item_name, unit, qty")
    .eq("manual_stock_opname_id", docId)
    .order("sort_order", { ascending: true });

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="print:hidden">
        <p className="text-xs font-medium text-zinc-400">{business.name}</p>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">STOCK OPNAME</h1>
            <p className="text-xs text-zinc-400">{doc.opname_number}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-zinc-400">Toko</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{business.name}</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Tanggal</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{formatDateTime(doc.created_at)}</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Barang</th>
                <th className="px-3 py-2 text-right font-medium">Qty Fisik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(items ?? []).map((it, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 text-zinc-700">{it.item_name}</td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {Number(it.qty)} {it.unit ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {doc.note && <p className="mt-3 text-xs text-zinc-500">Catatan: {doc.note}</p>}

        <div className="mt-8 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-zinc-400">Dihitung oleh</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">
              {doc.created_by_name ?? "________________"}
            </p>
          </div>
          <div>
            <p className="text-zinc-400">Diperiksa oleh</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">________________</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <PrintButton
          backHref={`/business/${businessId}/dokumen-manual?tab=stock-opname`}
          cetakLabel="Cetak Stock Opname"
        />
      </div>
    </div>
  );
}
