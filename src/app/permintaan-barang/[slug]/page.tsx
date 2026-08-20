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
    purchase_unit: string | null;
    purchase_conversion: number | null;
  }[];
};

export default async function PermintaanBarangPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_purchase_request_info", { p_slug: slug });

  if (!data) {
    notFound();
  }

  const info = data as unknown as PurchaseRequestInfo;

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
          purchaseUnit: i.purchase_unit,
          purchaseConversion: i.purchase_conversion,
        }))}
      />
    </div>
  );
}
