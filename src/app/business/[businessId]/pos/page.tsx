import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCashierSession } from "@/lib/cashier-session";
import PinScreen from "./pin-screen";
import OpenShiftScreen from "./open-shift-screen";
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
    .select("id, name, business_type")
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

  const { data: activeShift } = await supabase
    .from("shifts")
    .select("id, opening_cash, opened_at")
    .eq("business_id", businessId)
    .is("closed_at", null)
    .maybeSingle();

  if (!activeShift) {
    return (
      <OpenShiftScreen
        businessId={businessId}
        businessName={business.name}
        cashierId={session.cashierId}
        cashierName={session.name}
      />
    );
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, category, price, cost, stock, emoji")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const isFnb = business.business_type === "fnb";

  let selfOrders: SelfOrderRow[] = [];
  if (isFnb) {
    const { data: orderRows } = await supabase
      .from("self_orders")
      .select(
        "id, status, created_at, tables(name), self_order_items(product_id, name, qty, price, note)",
      )
      .eq("business_id", businessId)
      .neq("status", "selesai")
      .order("created_at", { ascending: true });
    selfOrders = (orderRows ?? []) as unknown as SelfOrderRow[];
  }

  return (
    <PosScreen
      businessId={businessId}
      businessName={business.name}
      cashierId={session.cashierId}
      cashierName={session.name}
      shiftId={activeShift.id}
      products={products ?? []}
      isFnb={isFnb}
      selfOrders={selfOrders.map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.created_at,
        tableName: o.tables?.name ?? "Meja terhapus",
        items: o.self_order_items.map((i) => ({
          productId: i.product_id,
          name: i.name,
          qty: i.qty,
          price: i.price,
          note: i.note,
        })),
      }))}
    />
  );
}

type SelfOrderRow = {
  id: string;
  status: "baru" | "diproses";
  created_at: string;
  tables: { name: string } | null;
  self_order_items: {
    product_id: string | null;
    name: string;
    qty: number;
    price: number;
    note: string | null;
  }[];
};
