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
    department: string | null;
    price: number;
    cost: number;
    hpp_checked: boolean;
    updated_at: string;
  }>((from, to) =>
    supabase
      .from("products")
      .select("id, name, category, department, price, cost, hpp_checked, updated_at")
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
      department: p.department,
      price,
      cost,
      margin,
      pct,
      hppChecked: p.hpp_checked,
      updatedAt: p.updated_at,
    };
  });

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Daftar HPP Menu</h1>
          <p className="mt-1 text-sm text-zinc-500">
            HPP seluruh menu (bukan berdasarkan periode transaksi) — {rows.length} menu.
          </p>
        </div>
      </div>

      <HppMenuListClient businessId={businessId} rows={rows} />
    </div>
  );
}
