import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import InvoiceForm from "./invoice-form";

export default async function NewInvoicePage({
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
    .select("id, name")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center gap-2">
        <Link
          href={`/business/${businessId}/invoices`}
          className="text-xs font-medium text-zinc-400 hover:text-brand-600"
        >
          ← Invoice/Nota
        </Link>
      </div>
      <h1 className="mt-1 text-lg font-bold text-zinc-900">Buat Invoice — {business.name}</h1>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <InvoiceForm
          businessId={businessId}
          today={todayWibDateString()}
          customers={customers ?? []}
        />
      </div>
    </div>
  );
}
