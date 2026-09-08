import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import HppMenuListClient from "./hpp-menu-list-client";

export default async function ReportsHppMenuPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!biz) notFound();

  // Katalog produk aktif -- bukan berbasis transaksi/periode seperti laporan
  // lain, jadi semua produk tampil walau belum pernah terjual.
  const products = await fetchAllRows<{
    id: string;
    name: string;
    category: string | null;
    price: number;
    cost: number;
  }>((from, to) =>
    supabase
      .from("products")
      .select("id, name, category, price, cost")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .range(from, to),
  );

  const rows = products.map((p) => {
    const price = Number(p.price);
    const cost = Number(p.cost);
    const margin = price - cost;
    const pct = price > 0 ? (cost / price) * 100 : 0;
    return {
      id: p.id,
      name: p.name,
      category: p.category || "Tanpa Kategori",
      price,
      cost,
      margin,
      pct,
    };
  });

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-lg font-bold text-zinc-900">Daftar HPP Menu</h1>
      <p className="mt-1 text-sm text-zinc-500">
        HPP seluruh menu (bukan berdasarkan periode transaksi) — {rows.length} menu.
      </p>

      <HppMenuListClient businessId={businessId} rows={rows} />
    </div>
  );
}
