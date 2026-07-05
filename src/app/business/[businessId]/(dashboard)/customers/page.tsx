import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addCustomer } from "./actions";
import AddCustomerForm from "./add-customer-form";

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

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const boundAddCustomer = addCustomer.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Pelanggan — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Data pelanggan dan riwayat pembeliannya.
        </p>

        <div className="mt-6 space-y-2">
          {customers && customers.length > 0 ? (
            customers.map((c) => (
              <Link
                key={c.id}
                href={`/business/${businessId}/customers/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-brand-300"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{c.name}</p>
                  <p className="text-xs text-zinc-500">
                    {c.phone || c.email || "Tanpa kontak"}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-zinc-400">Detail →</span>
              </Link>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada pelanggan. Tambahkan supaya bisa dipilih saat checkout di kasir.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Pelanggan</h2>
          <AddCustomerForm action={boundAddCustomer} />
        </div>
    </div>
  );
}
