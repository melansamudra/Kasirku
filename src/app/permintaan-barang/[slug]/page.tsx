import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestClient from "./request-client";

type PurchaseRequestInfo = {
  business_id: string;
  business_name: string;
  business_type: string;
  employees: { id: string; name: string }[];
  items: {
    id: string;
    name: string;
    unit: string;
    stock: number;
    department: string | null;
    barcode: string | null;
    purchase_units: { unitName: string; conversion: number }[];
  }[];
  stock_locations: { id: string; name: string; is_production: boolean }[];
};

export default async function PermintaanBarangPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lokasi?: string }>;
}) {
  const { slug } = await params;
  const { lokasi } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_purchase_request_info", { p_slug: slug });

  if (!data) {
    notFound();
  }

  const info = data as unknown as PurchaseRequestInfo;

  // Link "?lokasi=produksi" datang dari QR/link khusus yang dipasang di
  // Dapur Produksi -- lokasi dikunci ke lokasi yang ditandai is_production,
  // staf tidak perlu (dan tidak bisa) pilih lokasi lain, supaya stok bahan
  // yang mereka order selalu tercatat di lokasi yang benar.
  const lockedLocation =
    lokasi === "produksi" ? (info.stock_locations ?? []).find((l) => l.is_production) : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <RequestClient
        slug={slug}
        businessName={info.business_name}
        isFnb={info.business_type === "fnb"}
        employees={info.employees}
        items={info.items.map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          stock: i.stock,
          department: i.department,
          barcode: i.barcode,
          purchaseUnits: i.purchase_units ?? [],
        }))}
        stockLocations={info.stock_locations ?? []}
        lockedLocation={lockedLocation ? { id: lockedLocation.id, name: lockedLocation.name } : null}
      />
    </div>
  );
}
