import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ManualTransactionForm from "./manual-transaction-form";

export default async function NewManualTransactionPage({
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

  const [{ data: products }, { data: customers }, { data: customPaymentMethodRows }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, category, price, stock, variant_label")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("customers")
        .select("id, name, phone")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("custom_payment_methods")
        .select("name")
        .eq("business_id", businessId)
        .order("name", { ascending: true }),
    ]);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">Transaksi Manual — {business.name}</h1>
        <Link
          href={`/business/${businessId}/transactions`}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          ← Kembali
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Catat transaksi tanpa lewat kasir — cocok untuk penjualan yang terlewat dicatat, dengan
        tanggal yang bisa diatur bebas.
      </p>

      <div className="mt-6">
        <ManualTransactionForm
          businessId={businessId}
          products={products ?? []}
          customers={customers ?? []}
          customPaymentMethods={(customPaymentMethodRows ?? []).map((m) => m.name)}
        />
      </div>
    </div>
  );
}
