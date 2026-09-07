import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";

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

export default async function InterUnitTransferDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; transferId: string }>;
}) {
  const { businessId, transferId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) notFound();

  const { data: transfer } = await supabase
    .from("inter_unit_transfers")
    .select(
      "id, transfer_number, from_business_id, to_business_id, from_location_id, to_location_id, note, sent_by_name, total_amount, created_at",
    )
    .eq("id", transferId)
    .maybeSingle();
  if (!transfer) notFound();

  // RLS mengizinkan akses kalau businessId ini pengirim ATAU penerima --
  // tapi route-nya sendiri di-scope ke satu businessId, jadi tegaskan
  // relevansinya di sini juga (bukan bisnis ke-3 yang kebetulan tahu URL-nya).
  if (transfer.from_business_id !== businessId && transfer.to_business_id !== businessId) {
    notFound();
  }

  const [
    { data: fromBusiness },
    { data: toBusiness },
    { data: fromLocation },
    { data: toLocation },
    { data: items },
  ] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", transfer.from_business_id).single(),
    supabase.from("businesses").select("name").eq("id", transfer.to_business_id).single(),
    supabase.from("stock_locations").select("name").eq("id", transfer.from_location_id).maybeSingle(),
    supabase.from("stock_locations").select("name").eq("id", transfer.to_location_id).maybeSingle(),
    supabase
      .from("inter_unit_transfer_items")
      .select("id, item_name, unit, qty, unit_cost, amount")
      .eq("transfer_id", transferId)
      .order("item_name", { ascending: true }),
  ]);

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="print:hidden">
        <p className="text-xs font-medium text-zinc-400">{business.name}</p>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">SURAT JALAN ANTAR-UNIT</h1>
            <p className="text-xs text-zinc-400">{transfer.transfer_number}</p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">Selesai</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-zinc-400">Dari</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{fromBusiness?.name ?? "—"}</p>
            <p className="text-zinc-500">{fromLocation?.name ?? "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Ke</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{toBusiness?.name ?? "—"}</p>
            <p className="text-zinc-500">{toLocation?.name ?? "—"}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-zinc-400">Tanggal</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{formatDateTime(transfer.created_at)}</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Dikirim oleh</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{transfer.sent_by_name}</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Bahan</th>
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
                  <td className="px-3 py-2 text-right text-zinc-500">{formatRupiah(Number(it.unit_cost))}</td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-900">{formatRupiah(Number(it.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 ml-auto w-full max-w-[220px] space-y-1 text-xs">
          <div className="flex justify-between border-t border-zinc-100 pt-1 text-sm font-bold">
            <span className="text-zinc-900">Total</span>
            <span className="text-brand-700">{formatRupiah(Number(transfer.total_amount))}</span>
          </div>
        </div>

        {transfer.note && (
          <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">Catatan: {transfer.note}</p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-zinc-400">Dikirim oleh — {fromBusiness?.name}</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">{transfer.sent_by_name}</p>
          </div>
          <div>
            <p className="text-zinc-400">Diterima oleh — {toBusiness?.name}</p>
            <p className="mt-8 border-t border-zinc-300 pt-1 font-medium text-zinc-700">________________</p>
          </div>
        </div>

        <p className="mt-4 text-[10.5px] text-zinc-400">
          Nilai barang di atas tercatat sebagai Piutang Antar-Unit di {fromBusiness?.name} dan Hutang Antar-Unit di{" "}
          {toBusiness?.name} — bisa dilihat di Buku Besar/Neraca masing-masing bisnis (akun 1-110 / 2-110).
        </p>
      </div>

      <div className="mt-4">
        <PrintButton businessId={businessId} />
      </div>
    </div>
  );
}
