import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addCashier } from "./actions";
import AddCashierForm from "./add-cashier-form";

export default async function CashiersPage({
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

  // Explicit column list — pin_hash must never be requested from the client.
  const { data: cashiers } = await supabase
    .from("cashiers")
    .select("id, name, role, active")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  const boundAddCashier = addCashier.bind(null, businessId);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/dashboard" className="text-xs font-medium text-zinc-500 hover:underline">
          ← Kembali ke dashboard
        </Link>

        <h1 className="mt-3 text-lg font-bold text-zinc-900">Kasir — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Daftar kasir yang bisa masuk ke layar kasir toko ini.
        </p>

        <div className="mt-6 space-y-2">
          {cashiers && cashiers.length > 0 ? (
            cashiers.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{c.name}</p>
                  <p className="text-xs text-zinc-500">
                    {c.role === "manajer" ? "Manajer" : "Kasir"}
                  </p>
                </div>
                {!c.active && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    Nonaktif
                  </span>
                )}
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada kasir. Tambahkan minimal satu supaya bisa mulai jualan.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Kasir</h2>
          <AddCashierForm action={boundAddCashier} />
        </div>
      </div>
    </div>
  );
}
