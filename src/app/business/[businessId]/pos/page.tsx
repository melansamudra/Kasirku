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
    .select(
      "id, name, business_type, tax_enabled, tax_rate, service_enabled, service_rate",
    )
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

  const { data: openBillRows } = await supabase
    .from("open_bills")
    .select("id, label, items, updated_at")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false });

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const { data: customPaymentMethodRows } = await supabase
    .from("custom_payment_methods")
    .select("name")
    .eq("business_id", businessId)
    .order("name", { ascending: true });

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
      taxRate={business.tax_enabled ? Number(business.tax_rate) : 0}
      serviceRate={business.service_enabled ? Number(business.service_rate) : 0}
      openBills={(openBillRows ?? []) as unknown as OpenBillRow[]}
      customers={customers ?? []}
      isFnb={isFnb}
      customPaymentMethods={(customPaymentMethodRows ?? []).map((m) => m.name)}
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

type OpenBillRow = {
  id: string;
  label: string;
  updated_at: string;
  items: {
    product_id: string;
    name: string;
    price: number;
    qty: number;
    disc: number;
    disc_type: "pct" | "amt";
  }[];
};

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
