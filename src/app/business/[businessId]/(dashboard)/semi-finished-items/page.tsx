import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeAllSemiFinishedItemCosts } from "@/lib/cost-control/compute-cost";
import { addSemiFinishedItem } from "./actions";
import ItemForm from "./item-form";
import DeleteItemButton from "./delete-item-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatQty(value: number) {
  return Number(value.toFixed(2)).toLocaleString("id-ID");
}

export default async function SemiFinishedItemsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: items } = await supabase
    .from("semi_finished_items")
    .select("id, name, unit, stock, min_stock")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const costs = await computeAllSemiFinishedItemCosts(supabase, businessId);
  const boundAddItem = addSemiFinishedItem.bind(null, businessId);

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-lg font-bold text-zinc-900">Bahan Setengah Jadi — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Resep (BOM) bahan setengah jadi yang dibuat tim produksi. HPP dihitung otomatis dari bahan
        baku &amp; bahan setengah jadi lain yang dipakai — atur resepnya di halaman detail tiap item.
      </p>

      <div className="mt-6 space-y-2">
        {items && items.length > 0 ? (
          items.map((item) => {
            const cost = costs.get(item.id);
            const unitCost = cost?.unitCost ?? 0;
            const low = item.stock < item.min_stock;
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/business/${businessId}/semi-finished-items/${item.id}`}
                    className="text-sm font-medium text-zinc-900 hover:text-brand-600 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    Stok {formatQty(item.stock)} {item.unit}
                    {low && <span className="ml-1.5 font-medium text-amber-600">· rendah</span>}
                  </p>
                </div>
                <p className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                  HPP {formatRupiah(unitCost)}/{item.unit}
                </p>
                <DeleteItemButton businessId={businessId} itemId={item.id} itemName={item.name} />
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada bahan setengah jadi. Tambahkan dulu, lalu atur resepnya di halaman detail.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Bahan Setengah Jadi</h2>
        <ItemForm action={boundAddItem} submitLabel="+ Tambah Bahan Setengah Jadi" />
      </div>
    </div>
  );
}
