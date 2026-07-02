import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addIngredient } from "./actions";
import AddIngredientForm from "./add-ingredient-form";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export default async function IngredientsPage({
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

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, unit_cost, stock")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const boundAddIngredient = addIngredient.bind(null, businessId);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/dashboard" className="text-xs font-medium text-zinc-500 hover:underline">
          ← Kembali ke dashboard
        </Link>

        <h1 className="mt-3 text-lg font-bold text-zinc-900">Bahan Baku — {business.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Daftar bahan baku, dipakai untuk hitung HPP resep produk.
        </p>

        <div className="mt-6 space-y-2">
          {ingredients && ingredients.length > 0 ? (
            ingredients.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{i.name}</p>
                  <p className="text-xs text-zinc-500">
                    Stok {i.stock} {i.unit}
                  </p>
                </div>
                <p className="text-sm font-semibold text-zinc-900">
                  {formatRupiah(Number(i.unit_cost))}/{i.unit}
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada bahan baku. Tambahkan minimal satu supaya bisa dipakai di resep.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Bahan Baku</h2>
          <AddIngredientForm action={boundAddIngredient} />
        </div>
      </div>
    </div>
  );
}
