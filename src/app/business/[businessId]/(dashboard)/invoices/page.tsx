import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  unpaid: "Belum Dibayar",
  partial: "Sebagian",
  paid: "Lunas",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  unpaid: "bg-amber-50 text-amber-700",
  partial: "bg-blue-50 text-blue-700",
  paid: "bg-brand-50 text-brand-700",
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  date: string;
  due_date: string | null;
  subtotal: number;
  dp_amount: number;
  status: string;
};

export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_name, date, due_date, subtotal, dp_amount, status")
    .eq("business_id", businessId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (invoices ?? []) as InvoiceRow[];

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Invoice/Nota — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Dokumen tagihan untuk klien — belum tercatat sebagai transaksi kasir.
          </p>
        </div>
        <Link
          href={`/business/${businessId}/invoices/baru`}
          className="rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          + Buat Invoice
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
        {rows.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const sisa = r.subtotal - r.dp_amount;
              return (
                <Link
                  key={r.id}
                  href={`/business/${businessId}/invoices/${r.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">
                      {r.customer_name}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {r.invoice_number} · {formatDate(r.date)}
                      {r.due_date && ` · Jatuh tempo ${formatDate(r.due_date)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-zinc-900">{formatRupiah(r.subtotal)}</p>
                    <span
                      className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status] ?? "bg-zinc-100 text-zinc-500"}`}
                    >
                      {r.status === "paid"
                        ? STATUS_LABELS.paid
                        : `${STATUS_LABELS[r.status] ?? r.status} · Sisa ${formatRupiah(sisa)}`}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada invoice dibuat</p>
        )}
      </div>
    </div>
  );
}
