import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCashierSession } from "@/lib/cashier-session";
import PinScreen from "./pin-screen";
import PosScreen from "./pos-screen";

export default async function PosPage({
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

  const { data: products } = await supabase
    .from("products")
    .select("id, name, category, price, cost, stock, emoji")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  return (
    <PosScreen
      businessId={businessId}
      businessName={business.name}
      cashierId={session.cashierId}
      cashierName={session.name}
      products={products ?? []}
    />
  );
}
