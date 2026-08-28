import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TransferClient from "./transfer-client";

type TransferInfo = {
  business_id: string;
  business_name: string;
  employees: { id: string; name: string }[];
  stock_locations: { id: string; name: string; is_production: boolean }[];
  semi_finished_items: { id: string; name: string; unit: string }[];
};

export default async function TransferInternalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lokasi?: string }>;
}) {
  const { slug } = await params;
  const { lokasi } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_location_transfer_info", { p_slug: slug });
  if (!data) {
    notFound();
  }
  const info = data as unknown as TransferInfo;

  const requestingLocation = info.stock_locations.find((l) => l.id === lokasi && !l.is_production);

  if (!requestingLocation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Link belum diarahkan ke lokasi</p>
          <p className="mt-1.5 text-xs text-zinc-500">
            Minta admin kirim ulang link permintaan bahan yang benar (harus ada bagian
            &quot;?lokasi=...&quot; di alamatnya).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <TransferClient
        slug={slug}
        businessName={info.business_name}
        location={{ id: requestingLocation.id, name: requestingLocation.name }}
        employees={info.employees}
        semiFinishedItems={info.semi_finished_items}
      />
    </div>
  );
}
