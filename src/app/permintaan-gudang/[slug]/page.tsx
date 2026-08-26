import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestClient from "./request-client";

type WarehouseRequestInfo = {
  business_id: string;
  business_name: string;
  warehouses: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  items: { id: string; name: string; unit: string; warehouseId: string }[];
};

export default async function PermintaanGudangPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_warehouse_request_info", { p_slug: slug });

  if (!data) {
    notFound();
  }

  const info = data as unknown as WarehouseRequestInfo;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <RequestClient
        slug={slug}
        businessName={info.business_name}
        warehouses={info.warehouses}
        employees={info.employees}
        items={info.items}
      />
    </div>
  );
}
