import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OpnameClient from "./opname-client";

type StockOpnameInfo = {
  business_id: string;
  business_name: string;
  cost_control_enabled: boolean;
  employees: { id: string; name: string }[];
  stock_locations: { id: string; name: string; is_default_purchase: boolean; is_production: boolean }[];
  ingredients: { id: string; name: string; unit: string }[];
  semi_finished_items: { id: string; name: string; unit: string }[];
};

export default async function StockOpnamePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lokasi?: string }>;
}) {
  const { slug } = await params;
  const { lokasi } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_stock_opname_info", { p_slug: slug });
  if (!data) {
    notFound();
  }
  const info = data as unknown as StockOpnameInfo;

  // Sama pola dengan Permintaan Barang: link ini SELALU datang lewat
  // ?lokasi=produksi (dibagikan admin dari halaman Dapur Produksi),
  // lokasinya sudah pasti dikunci -- tidak ada mode "staf pilih sendiri"
  // supaya tidak perlu fetch stok live tambahan di client tanpa auth.
  const location =
    lokasi === "produksi" ? info.stock_locations.find((l) => l.is_production) : undefined;

  if (!location) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Link belum diarahkan ke lokasi</p>
          <p className="mt-1.5 text-xs text-zinc-500">
            Minta admin kirim ulang link stok opname yang benar (harus ada bagian
            &quot;?lokasi=...&quot; di alamatnya).
          </p>
        </div>
      </div>
    );
  }

  const { data: snapshotData } = await supabase.rpc("get_location_stock_snapshot", {
    p_slug: slug,
    p_location_id: location.id,
  });
  const snapshot = snapshotData as unknown as {
    ingredient_stocks: { id: string; stock: number }[];
    semi_finished_stocks: { id: string; stock: number }[];
  } | null;

  const ingredientStockById = new Map((snapshot?.ingredient_stocks ?? []).map((r) => [r.id, r.stock]));
  const semiFinishedStockById = new Map((snapshot?.semi_finished_stocks ?? []).map((r) => [r.id, r.stock]));

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <OpnameClient
        slug={slug}
        businessName={info.business_name}
        location={{ id: location.id, name: location.name }}
        employees={info.employees}
        ingredients={info.ingredients.map((i) => ({ ...i, currentStock: ingredientStockById.get(i.id) ?? 0 }))}
        semiFinishedItems={
          location.is_default_purchase
            ? []
            : info.semi_finished_items.map((s) => ({ ...s, currentStock: semiFinishedStockById.get(s.id) ?? 0 }))
        }
      />
    </div>
  );
}
