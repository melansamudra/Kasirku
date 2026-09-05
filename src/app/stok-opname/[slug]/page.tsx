import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OpnameClient from "./opname-client";

type StockOpnameInfo = {
  business_id: string;
  business_name: string;
  cost_control_enabled: boolean;
  employees: { id: string; name: string }[];
  stock_locations: {
    id: string;
    name: string;
    is_default_purchase: boolean;
    is_production: boolean;
    bound_section_ids: string[];
  }[];
  sections: { id: string; name: string }[];
  ingredients: { id: string; name: string; unit: string; section_ids: string[] }[];
  semi_finished_items: { id: string; name: string; unit: string; section_ids: string[] }[];
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

  // Sama pola dengan Permintaan Barang/Transfer Internal: lokasinya
  // dikunci lewat ?lokasi=<id lokasi> (dibagikan admin dari halaman
  // Stok Opname lokasi itu) -- tidak ada mode "staf pilih sendiri"
  // supaya tidak perlu fetch stok live tambahan di client tanpa auth.
  const location = info.stock_locations.find((l) => l.id === lokasi);

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

  // Lokasi diikat ke Bagian tertentu (mis. lokasi Bar = Bagian "Bar") --
  // sama pola dengan halaman Bahan Baku internal (lihat bahan-baku/page.tsx):
  // kosong = tidak dibatasi, tampilkan semua seperti sebelumnya. Kalau
  // terikat, link ini dikunci penuh ke Bagian itu -- tidak ada dropdown buat
  // lihat/isi bahan Bagian lain, supaya link Bar & Kitchen tidak lagi
  // "kebaca semua divisi".
  const boundSectionIds = location.bound_section_ids;
  const isLocked = boundSectionIds.length > 0;
  const matchesBoundSection = (sectionIds: string[]) => sectionIds.some((id) => boundSectionIds.includes(id));
  const lockedSectionId = isLocked ? boundSectionIds[0] : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <OpnameClient
        slug={slug}
        businessName={info.business_name}
        location={{ id: location.id, name: location.name }}
        employees={info.employees}
        lockedSectionId={lockedSectionId}
        ingredients={info.ingredients
          .filter((i) => !isLocked || matchesBoundSection(i.section_ids))
          .map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            currentStock: ingredientStockById.get(i.id) ?? 0,
          }))}
        semiFinishedItems={
          location.is_default_purchase
            ? []
            : info.semi_finished_items
                .filter((s) => !isLocked || matchesBoundSection(s.section_ids))
                .map((s) => ({
                  id: s.id,
                  name: s.name,
                  unit: s.unit,
                  currentStock: semiFinishedStockById.get(s.id) ?? 0,
                }))
        }
      />
    </div>
  );
}
