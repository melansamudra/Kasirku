import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import InvoiceForm from "./invoice-form";

export default async function NewAdminInvoicePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const service = createServiceClient();
  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) notFound();

  const { data: businesses } = await service
    .from("businesses")
    .select("id, name")
    .order("name", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen flex-1 bg-zinc-50">
      <header className="border-b border-zinc-800 bg-zinc-900 px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <p className="text-sm font-bold text-white">Buat Invoice Langganan</p>
          <Link
            href="/admin/invoices"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            ← Kembali
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <InvoiceForm businesses={businesses ?? []} today={today} />
      </main>
    </div>
  );
}
