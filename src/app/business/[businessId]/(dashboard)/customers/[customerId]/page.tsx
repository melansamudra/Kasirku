import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { editCustomer } from "../actions";
import DeleteCustomerButton from "./delete-customer-button";
import EditCustomerForm from "./edit-customer-form";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; customerId: string }>;
}) {
  const { businessId, customerId } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, email, note")
    .eq("id", customerId)
    .eq("business_id", businessId)
    .single();

  if (!customer) {
    notFound();
  }

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, invoice_number, date, total, voided")
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .order("date", { ascending: false })
    .limit(50);

  const validTransactions = (transactions ?? []).filter((t) => !t.voided);
  const totalSpent = validTransactions.reduce((sum, t) => sum + Number(t.total), 0);
  const lastVisit = transactions?.[0]?.date;

  const boundEditCustomer = editCustomer.bind(null, businessId, customerId);

  return (
    <div className="w-full max-w-2xl">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-zinc-900">{customer.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {customer.phone || "—"}
              {customer.email ? ` · ${customer.email}` : ""}
            </p>
            {customer.note && <p className="mt-1 text-xs text-zinc-400">{customer.note}</p>}
          </div>
          <EditCustomerForm
            name={customer.name}
            phone={customer.phone}
            email={customer.email}
            note={customer.note}
            action={boundEditCustomer}
          />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
            <p className="text-sm font-bold text-zinc-900">{validTransactions.length}</p>
            <p className="text-[10px] text-zinc-500">Transaksi</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
            <p className="text-sm font-bold text-zinc-900">{formatRupiah(totalSpent)}</p>
            <p className="text-[10px] text-zinc-500">Total Belanja</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
            <p className="text-xs font-bold text-zinc-900">
              {lastVisit ? formatDateTime(lastVisit) : "—"}
            </p>
            <p className="text-[10px] text-zinc-500">Kunjungan Terakhir</p>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Riwayat Transaksi</h2>
          {transactions && transactions.length > 0 ? (
            transactions.map((t) => (
              <Link
                key={t.id}
                href={`/business/${businessId}/transactions/${t.id}`}
                className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-brand-300"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-zinc-900">{t.invoice_number}</p>
                  {t.voided ? (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                      Dibatalkan
                    </span>
                  ) : (
                    <p className="text-sm font-semibold text-zinc-900">
                      {formatRupiah(Number(t.total))}
                    </p>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">{formatDateTime(t.date)}</p>
              </Link>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada transaksi dari pelanggan ini.
            </p>
          )}
        </div>

        <DeleteCustomerButton businessId={businessId} customerId={customerId} />
    </div>
  );
}
