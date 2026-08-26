import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestClient from "./request-client";

type OutletRequestInfo = {
  business_id: string;
  business_name: string;
  outlets: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  items: { id: string; name: string; unit: string; stock: number }[];
};

export default async function PermintaanRestoPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_outlet_request_info", { p_slug: slug });

  if (!data) {
    notFound();
  }

  const info = data as unknown as OutletRequestInfo;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <RequestClient
        slug={slug}
        businessName={info.business_name}
        outlets={info.outlets}
        employees={info.employees}
        items={info.items}
      />
    </div>
  );
}
