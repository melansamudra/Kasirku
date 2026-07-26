import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCashierSession } from "@/lib/cashier-session";
import PinScreen from "../pin-screen";
import PrinterTestScreen from "./printer-test-screen";

export default async function PosPrintersPage({
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

  const session = await getCashierSession(businessId);

  if (!session) {
    const { data: cashiers } = await supabase
      .from("cashiers")
      .select("id, name, role")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("created_at", { ascending: true });

    return (
      <PinScreen
        businessId={businessId}
        businessName={business.name}
        cashiers={cashiers ?? []}
      />
    );
  }

  const { data: printerRows } = await supabase
    .from("kitchen_printers")
    .select("id, name, categories, connection_type, address, device_label")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

  return (
    <PrinterTestScreen
      businessId={businessId}
      businessName={business.name}
      printers={printerRows ?? []}
    />
  );
}
