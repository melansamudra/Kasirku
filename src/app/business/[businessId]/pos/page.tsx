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

  // business (DB) and the cashier session (a cookie read, not a query) don't
  // depend on each other — fire both at once instead of waiting in sequence.
  const [{ data: business }, session] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "id, name, business_type, tax_enabled, tax_rate, service_enabled, service_rate",
      )
      .eq("id", businessId)
      .single(),
    getCashierSession(businessId),
  ]);

  if (!business) {
    notFound();
  }

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

  const isFnb = business.business_type === "fnb";

  // Katalog (produk/open bill/customer/metode bayar) dan self_orders sengaja
  // TIDAK di-fetch di sini lagi — dulu ini adalah blocker utama: Server
  // Component ini harus selesai await semua query sebelum Next.js kirim HTML
  // apa pun, jadi client tidak bisa render apa-apa (bahkan dari cache) sampai
  // roundtrip itu kelar. Sekarang PosScreen (client) yang ambil sendiri lewat
  // getPosCatalog()/getSelfOrders(), didahului render instan dari cache
  // IndexedDB — lihat pos-cache.ts. page.tsx cuma menyisakan query murah
  // (gating PIN/shift) yang memang harus selesai duluan.
  return (
    <PosScreen
      businessId={businessId}
      businessName={business.name}
      cashierId={session.cashierId}
      cashierName={session.name}
      shiftId={activeShift.id}
      taxRate={business.tax_enabled ? Number(business.tax_rate) : 0}
      serviceRate={business.service_enabled ? Number(business.service_rate) : 0}
      isFnb={isFnb}
    />
  );
}
