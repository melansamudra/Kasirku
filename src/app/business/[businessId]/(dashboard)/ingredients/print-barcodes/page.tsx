import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import BarcodeSheet from "./barcode-sheet";

export default async function PrintBarcodesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const ingredients = await fetchAllRows((from, to) =>
    supabase
      .from("ingredients")
      .select("id, name, unit, barcode")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .not("barcode", "is", null)
      .order("name", { ascending: true })
      .range(from, to),
  );

  const items = ingredients
    .filter((i): i is typeof i & { barcode: string } => !!i.barcode)
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, barcode: i.barcode }));

  return <BarcodeSheet businessName={business.name} items={items} />;
}
