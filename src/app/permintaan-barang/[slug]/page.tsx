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
    departments: string[];
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

  // Link "?lokasi=<uuid lokasi>" dari QR/link khusus 1 lokasi (dashboard
  // Permintaan Barang, difilter per lokasi) -- lokasi dikunci, staf tidak
  // perlu (dan tidak bisa) pilih lokasi lain, supaya stok bahan yang
  // mereka order selalu tercatat di lokasi yang benar. "?lokasi=produksi"
  // tetap dikenali buat backward-compat -- poster QR lama yang sudah
  // ditempel/dicetak sebelum link ini digeneralisasi per-lokasi.
  const lockedLocation =
    lokasi === "produksi"
      ? (info.stock_locations ?? []).find((l) => l.is_production)
      : (info.stock_locations ?? []).find((l) => l.id === lokasi);

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
          departments: i.departments,
          barcode: i.barcode,
          purchaseUnits: i.purchase_units ?? [],
        }))}
        stockLocations={info.stock_locations ?? []}
        lockedLocation={lockedLocation ? { id: lockedLocation.id, name: lockedLocation.name } : null}
      />
    </div>
  );
}
