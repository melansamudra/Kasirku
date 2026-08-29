import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function OperasionalHubPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, cost_control_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: locations } = await supabase
    .from("stock_locations")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("is_production", false)
    .eq("is_default_purchase", false)
    .order("sort_order");

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Operasional</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Pilih lokasi buat lihat Bahan Baku, Stok Opname, Transfer Internal, Kartu Stok, dan
        Permintaan Barang khusus lokasi itu.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(locations ?? []).length > 0 ? (
          (locations ?? []).map((loc) => (
            <Link
              key={loc.id}
              href={`/business/${businessId}/operasional/${loc.id}`}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-6 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50/30"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg">
                🏠
              </div>
              <p className="text-base font-semibold text-zinc-900">{loc.name}</p>
            </Link>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400 sm:col-span-2">
            Belum ada lokasi operasional.
          </p>
        )}
      </div>
    </div>
  );
}
