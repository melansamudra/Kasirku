import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PublicHppMenuClient from "./public-hpp-menu-client";

type HppMenuInfo = {
  business_id: string;
  business_name: string;
  products: {
    id: string;
    name: string;
    category: string | null;
    department: string | null;
    price: number;
    cost: number;
    hpp_checked: boolean;
    updated_at: string;
    recipe: { ingredient_name: string; qty: number; unit: string; unit_cost: number }[];
  }[];
};

export default async function PublicHppMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_hpp_menu_info", { p_slug: slug });
  if (!data) {
    notFound();
  }
  const info = data as unknown as HppMenuInfo;

  const rows = info.products.map((p) => {
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
      recipe: p.recipe ?? [],
    };
  });

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-lg font-bold text-zinc-900">Daftar HPP Menu</h1>
        <p className="mt-1 text-sm text-zinc-500">Harga Jual, HPP, dan Margin seluruh menu — {rows.length} menu.</p>
        <PublicHppMenuClient rows={rows} />
      </div>
    </div>
  );
}
