import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";

type DeliveryNote = {
  dn_number: string | null;
  from_location_name: string;
  to_location_name: string;
  fulfilled_by_name: string | null;
  fulfilled_at: string;
  items: { item_name: string; unit: string; qty_sent: number }[];
};

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

export default async function PortalSuratJalanCetakPage({
  params,
}: {
  params: Promise<{ slug: string; transferId: string }>;
}) {
  const { slug, transferId } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_location_transfer_delivery_note", {
    p_slug: slug,
    p_transfer_id: transferId,
  });
  if (!data) notFound();
  const dn = data as unknown as DeliveryNote;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 print:block print:min-h-0 print:bg-white print:p-0">
      <div className="w-full max-w-md print:max-w-none">
        <div className="rounded-2xl bg-white p-5 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <h1 className="text-lg font-bold text-zinc-900">SURAT JALAN</h1>
          <p className="text-xs text-zinc-400">{dn.dn_number ?? "—"}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-zinc-400">Dari</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{dn.from_location_name}</p>
              <p className="mt-1 text-zinc-400">Ke</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{dn.to_location_name}</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-400">Tanggal</p>
              <p className="mt-0.5 font-semibold text-zinc-900">{formatDateTime(dn.fulfilled_at)}</p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Bahan</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {dn.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-zinc-700">{it.item_name}</td>
                    <td className="px-3 py-2 text-right text-zinc-500">
                      {Number(it.qty_sent)} {it.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-zinc-400">Dikirim oleh</p>
              <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">
                {dn.fulfilled_by_name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-zinc-400">Diterima oleh</p>
              <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">________________</p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <PrintButton />
        </div>
      </div>
    </div>
  );
}
