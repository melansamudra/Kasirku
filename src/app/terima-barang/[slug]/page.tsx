import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReceiveClient from "./receive-client";

type ReceiveStockInfo = {
  business_name: string;
  location: { id: string; name: string } | null;
  employees?: { id: string; name: string }[];
  pending?: { id: string; item_name: string; unit: string | null; qty: number; marked_at: string }[];
};

export default async function ReceiveStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lokasi?: string }>;
}) {
  const { slug } = await params;
  const { lokasi } = await searchParams;
  const supabase = await createClient();

  // Sama pola dengan Stok Opname: lokasinya dikunci lewat ?lokasi=<uuid>
  // (dibagikan dari halaman Bahan Baku lokasi itu) -- tidak ada mode "staf
  // pilih sendiri lokasi".
  if (!lokasi) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Link belum diarahkan ke lokasi</p>
          <p className="mt-1.5 text-xs text-zinc-500">
            Minta admin kirim ulang link terima barang yang benar (harus ada bagian
            &quot;?lokasi=...&quot; di alamatnya).
          </p>
        </div>
      </div>
    );
  }

  const { data } = await supabase.rpc("get_receive_stock_info", { p_slug: slug, p_location_id: lokasi });
  if (!data) {
    notFound();
  }
  const info = data as unknown as ReceiveStockInfo;

  if (!info.location) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Link belum diarahkan ke lokasi</p>
          <p className="mt-1.5 text-xs text-zinc-500">
            Minta admin kirim ulang link terima barang yang benar (harus ada bagian
            &quot;?lokasi=...&quot; di alamatnya).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <ReceiveClient
        slug={slug}
        businessName={info.business_name}
        locationName={info.location.name}
        employees={info.employees ?? []}
        pending={info.pending ?? []}
      />
    </div>
  );
}
