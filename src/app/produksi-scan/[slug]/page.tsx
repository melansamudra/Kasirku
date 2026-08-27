import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestClient from "./request-client";

type RecipeLine = { name: string; qtyPerUnit: number; unit: string; availableStock: number };

type ProductionScanInfo = {
  business_id: string;
  business_name: string;
  employees: { id: string; name: string }[];
  items: { id: string; name: string; unit: string; stock: number; recipe: RecipeLine[] }[];
};

export default async function ProduksiScanPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_production_scan_info", { p_slug: slug });

  if (!data) {
    notFound();
  }

  const info = data as unknown as ProductionScanInfo;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <RequestClient
        slug={slug}
        businessName={info.business_name}
        employees={info.employees}
        items={info.items}
      />
    </div>
  );
}
