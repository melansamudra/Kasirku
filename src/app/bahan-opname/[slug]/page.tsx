import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { submitPublicOpname } from "./actions";
import OpnameClient from "./opname-client";

type OpnameInfo = {
  business_id: string;
  business_name: string;
  ingredients: { id: string; name: string; unit: string; stock: number; departments: string[] }[];
};

export default async function BahanOpnamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_ingredient_opname_info", { p_slug: slug });
  if (!data) {
    notFound();
  }
  const info = data as unknown as OpnameInfo;
  const boundSubmit = submitPublicOpname.bind(null, slug);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <OpnameClient businessName={info.business_name} ingredients={info.ingredients} action={boundSubmit} />
    </div>
  );
}
