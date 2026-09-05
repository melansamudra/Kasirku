import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import KasbonClient from "./kasbon-client";

type KasbonSubmitInfo = {
  business_id: string;
  business_name: string;
  employees: { id: string; name: string }[];
};

export default async function KasbonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_kasbon_submit_info", { p_slug: slug });
  if (!data) {
    notFound();
  }
  const info = data as unknown as KasbonSubmitInfo;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <KasbonClient slug={slug} businessName={info.business_name} employees={info.employees} />
    </div>
  );
}
