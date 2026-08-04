import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addCustomer } from "./actions";
import AddCustomerForm from "./add-customer-form";
import CopyPhonesButton from "./copy-phones-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default async function CustomersPage({
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

  const [{ data: customers }, { data: receivables }, { data: selfOrderRows }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, email")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("receivables")
      .select("customer_id, amount, paid_amount")
      .eq("business_id", businessId),
    supabase
      .from("self_orders")
      .select("customer_name, customer_phone, created_at, self_order_items(price, qty)")
      .eq("business_id", businessId)
      .not("customer_phone", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  type SelfCustomer = { name: string; phone: string; visits: number; totalSpend: number; lastVisit: string };
  const selfCustomerMap = new Map<string, SelfCustomer>();
  for (const order of (selfOrderRows ?? []) as unknown as { customer_name: string | null; customer_phone: string | null; created_at: string; self_order_items: { price: number; qty: number }[] }[]) {
    if (!order.customer_phone) continue;
    const phone = order.customer_phone;
    const orderTotal = order.self_order_items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const existing = selfCustomerMap.get(phone);
    if (existing) {
      existing.visits += 1;
      existing.totalSpend += orderTotal;
      if (order.created_at > existing.lastVisit) existing.lastVisit = order.created_at;
    } else {
      selfCustomerMap.set(phone, {
        name: order.customer_name ?? "Tanpa nama",
        phone,
        visits: 1,
        totalSpend: orderTotal,
        lastVisit: order.created_at,
      });
    }
  }
  const selfCustomers = Array.from(selfCustomerMap.values()).sort((a, b) =>
    b.lastVisit.localeCompare(a.lastVisit),
  );

  const piutangByCustomer = new Map<string, number>();
  for (const r of receivables ?? []) {
    if (!r.customer_id) continue;
    const sisa = Number(r.amount) - Number(r.paid_amount);
    piutangByCustomer.set(r.customer_id, (piutangByCustomer.get(r.customer_id) ?? 0) + sisa);
  }

  const boundAddCustomer = addCustomer.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Pelanggan — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Data pelanggan dan riwayat pembeliannya. Sisa piutang dihitung dari{" "}
          <Link href={`/business/${businessId}/receivables`} className="text-brand-600 hover:underline">
            Piutang Pelanggan
          </Link>{" "}
          yang belum lunas.
        </p>

        <div className="mt-6 space-y-2">
          {customers && customers.length > 0 ? (
            customers.map((c) => {
              const sisaPiutang = piutangByCustomer.get(c.id) ?? 0;
              return (
                <Link
                  key={c.id}
                  href={`/business/${businessId}/customers/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-brand-300"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{c.name}</p>
                    <p className="text-xs text-zinc-500">
                      {c.phone || c.email || "Tanpa kontak"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {sisaPiutang > 0 && (
                      <p className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Piutang {formatRupiah(sisaPiutang)}
                      </p>
                    )}
                    <span className="text-xs font-medium text-zinc-400">Detail →</span>
                  </div>
                </Link>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada pelanggan. Tambahkan supaya bisa dipilih saat checkout di kasir.
            </p>
          )}
        </div>

        {/* Riwayat Pelanggan Self-Order */}
        <div className="mt-8 rounded-xl bg-white shadow-sm p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Riwayat Pelanggan Self-Order</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Pelanggan yang scan QR meja dan mengisi nama &amp; nomor HP.
                {selfCustomers.length > 0 && ` ${selfCustomers.length} pelanggan unik.`}
              </p>
            </div>
            {selfCustomers.length > 0 && (
              <CopyPhonesButton phones={selfCustomers.map((c) => c.phone)} />
            )}
          </div>

          <div className="mt-4 space-y-2">
            {selfCustomers.length > 0 ? (
              selfCustomers.map((c) => (
                <div
                  key={c.phone}
                  className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{c.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{c.phone}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {c.visits}× kunjungan · Terakhir{" "}
                      {new Date(c.lastVisit).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-sm font-semibold text-zinc-900 tabular-nums">
                    {formatRupiah(c.totalSpend)}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
                Belum ada riwayat. Data muncul setelah pelanggan isi nama &amp; HP saat scan QR meja.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Pelanggan Kasir</h2>
          <AddCustomerForm action={boundAddCustomer} />
        </div>
    </div>
  );
}
