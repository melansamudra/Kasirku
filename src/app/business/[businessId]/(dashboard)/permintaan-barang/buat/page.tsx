import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestClient from "@/app/permintaan-barang/[slug]/request-client";
import { regeneratePurchaseRequestSlug } from "../actions";

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

// Versi dashboard (wajib login) dari halaman publik src/app/permintaan-barang/[slug] —
// reuse 100% komponen & action yang sama (RequestClient, submitPurchaseRequest,
// RPC get_purchase_request_info) karena semuanya sudah berbasis slug dan tidak
// peduli status login. Cuma dibungkus di dalam layout (dashboard) yang mewajibkan
// auth, jadi staf yang sudah login bisa ajukan permintaan tanpa keluar dari sesi
// dashboard-nya — link publik yang sudah ada TETAP jalan berdampingan, bukan diganti.
export default async function BuatPermintaanBarangPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ lokasi?: string }>;
}) {
  const { businessId } = await params;
  const { lokasi } = await searchParams;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, purchase_request_slug")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  let slug = business.purchase_request_slug;
  if (!slug) {
    const result = await regeneratePurchaseRequestSlug(businessId);
    if (result.error || !result.slug) {
      notFound();
    }
    slug = result.slug;
  }

  const { data } = await supabase.rpc("get_purchase_request_info", { p_slug: slug });
  if (!data) {
    notFound();
  }

  const info = data as unknown as PurchaseRequestInfo;
  const lockedLocation = lokasi ? (info.stock_locations ?? []).find((l) => l.id === lokasi) : undefined;

  return (
    <div className="w-full max-w-md">
      <Link
        href={`/business/${businessId}/permintaan-barang`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← Permintaan Barang
      </Link>
      <div className="mt-2">
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
    </div>
  );
}
