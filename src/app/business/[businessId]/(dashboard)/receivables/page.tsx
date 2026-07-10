import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addReceivable, addReceivablePayment } from "./actions";
import AddReceivableForm from "./add-receivable-form";
import AddPaymentForm from "./add-payment-form";

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

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

type ReceivableRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  paid_amount: number;
  customer_id: string | null;
};

export default async function ReceivablesPage({
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

  const today = toDateStr(new Date());

  const [{ data: customers }, { data: receivables }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("receivables")
      .select("id, date, description, amount, paid_amount, customer_id")
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const customerMap = new Map((customers ?? []).map((c) => [c.id, c.name]));

  const rows = (receivables ?? []) as ReceivableRow[];
  const totalPiutang = rows.reduce((s, r) => s + (Number(r.amount) - Number(r.paid_amount)), 0);
  const belumLunasCount = rows.filter((r) => Number(r.paid_amount) < Number(r.amount)).length;

  const boundAddReceivable = addReceivable.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Piutang Pelanggan — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Catat penjualan yang dibayar belakangan oleh pelanggan.
          </p>
        </div>
        <Link
          href={`/business/${businessId}/customers`}
          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
        >
          Kelola Pelanggan →
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-amber-700">
            Total Piutang Usaha
          </p>
          <p className="text-xl font-bold text-amber-700">{formatRupiah(totalPiutang)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">
            Belum Lunas
          </p>
          <p className="text-xl font-bold text-zinc-900">{belumLunasCount} tagihan</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Catat Piutang</h2>
        <AddReceivableForm action={boundAddReceivable} today={today} customers={customers ?? []} />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Piutang</h2>
        </div>
        {rows.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const sisaPiutang = Number(r.amount) - Number(r.paid_amount);
              const lunas = sisaPiutang <= 0;
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">
                        {r.description}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {formatDate(r.date)}
                        {r.customer_id ? ` · ${customerMap.get(r.customer_id) ?? "—"}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-zinc-900">{formatRupiah(Number(r.amount))}</p>
                      <p
                        className={`text-[11px] font-medium ${
                          lunas ? "text-brand-700" : "text-amber-600"
                        }`}
                      >
                        {lunas ? "Lunas" : `Sisa ${formatRupiah(sisaPiutang)}`}
                      </p>
                    </div>
                    {!lunas && (
                      <AddPaymentForm
                        today={today}
                        sisaPiutang={sisaPiutang}
                        action={addReceivablePayment.bind(null, businessId, r.id)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada piutang tercatat</p>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Setiap piutang otomatis ter-posting ke jurnal (debit Kas &amp; Bank dan/atau Piutang Usaha,
        kredit Pendapatan Penjualan sesuai jumlah dibayar).
      </p>
    </div>
  );
}
