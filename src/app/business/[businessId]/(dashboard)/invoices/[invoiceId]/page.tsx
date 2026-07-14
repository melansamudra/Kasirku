import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";
import MarkPaidButton from "./mark-paid-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  unpaid: "Belum Dibayar",
  partial: "Dibayar Sebagian",
  paid: "Lunas",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; invoiceId: string }>;
}) {
  const { businessId, invoiceId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, customer_name, date, due_date, subtotal, dp_amount, status, note",
    )
    .eq("id", invoiceId)
    .eq("business_id", businessId)
    .single();

  if (!invoice) {
    notFound();
  }

  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("id, description, qty, unit_price")
    .eq("invoice_id", invoiceId)
    .order("id", { ascending: true });

  const sisa = Number(invoice.subtotal) - Number(invoice.dp_amount);

  return (
    <div className="w-full max-w-2xl print:max-w-none">
      <div className="print:hidden">
        <p className="text-xs font-medium text-zinc-400">{business.name}</p>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">INVOICE</h1>
            <p className="text-xs text-zinc-400">{invoice.invoice_number}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              invoice.status === "paid"
                ? "bg-brand-50 text-brand-700"
                : invoice.status === "partial"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-amber-50 text-amber-700"
            }`}
          >
            {STATUS_LABELS[invoice.status] ?? invoice.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-zinc-400">Ditagihkan kepada</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{invoice.customer_name}</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Tanggal</p>
            <p className="mt-0.5 font-semibold text-zinc-900">{formatDate(invoice.date)}</p>
            {invoice.due_date && (
              <>
                <p className="mt-1 text-zinc-400">Jatuh Tempo</p>
                <p className="mt-0.5 font-semibold text-zinc-900">{formatDate(invoice.due_date)}</p>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Deskripsi</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Harga</th>
                <th className="px-3 py-2 text-right font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(lines ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 text-zinc-700">{l.description}</td>
                  <td className="px-3 py-2 text-right text-zinc-500">{Number(l.qty)}</td>
                  <td className="px-3 py-2 text-right text-zinc-500">
                    {formatRupiah(Number(l.unit_price))}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-900">
                    {formatRupiah(Number(l.qty) * Number(l.unit_price))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 ml-auto w-full max-w-[220px] space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">Subtotal</span>
            <span className="font-medium text-zinc-900">{formatRupiah(Number(invoice.subtotal))}</span>
          </div>
          {Number(invoice.dp_amount) > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-500">DP / Uang Muka</span>
              <span className="font-medium text-zinc-900">
                -{formatRupiah(Number(invoice.dp_amount))}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-100 pt-1 text-sm font-bold">
            <span className="text-zinc-900">Sisa Tagihan</span>
            <span className="text-brand-700">{formatRupiah(sisa)}</span>
          </div>
        </div>

        {invoice.note && (
          <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">{invoice.note}</p>
        )}
      </div>

      <div className="mt-4 space-y-2 print:hidden">
        {invoice.status !== "paid" && (
          <MarkPaidButton businessId={businessId} invoiceId={invoice.id} />
        )}
        <PrintButton businessId={businessId} />
      </div>
    </div>
  );
}
