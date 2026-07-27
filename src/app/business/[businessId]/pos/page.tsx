import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCashierSession } from "@/lib/cashier-session";
import PinScreen from "./pin-screen";
import OpenShiftScreen from "./open-shift-screen";
import PosScreen from "./pos-screen";
import TicketPosScreen from "./ticket-pos-screen";

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

  if (business.business_type === "tiket") {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const dayOfWeek = new Date(`${todayStr}T00:00:00`).getDay();

    // None of these 4 queries depend on each other's results — run together.
    const [
      { data: categoryRows },
      { data: customPaymentMethodRowsForTiket },
      { data: memberRows },
      { data: holidayRow },
    ] = await Promise.all([
      supabase
        .from("ticket_categories")
        .select(
          "id, name, price_weekday, price_holiday, member_price, group_min_qty, group_price",
        )
        .eq("business_id", businessId)
        .eq("active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("custom_payment_methods")
        .select("name")
        .eq("business_id", businessId)
        .order("name", { ascending: true }),
      supabase
        .from("members")
        .select("id, name, phone, member_code, valid_from, valid_until")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("ticket_holidays")
        .select("id")
        .eq("business_id", businessId)
        .eq("holiday_date", todayStr)
        .maybeSingle(),
    ]);
    const isHoliday = dayOfWeek === 0 || dayOfWeek === 6 || !!holidayRow;

    return (
      <TicketPosScreen
        businessId={businessId}
        businessName={business.name}
        cashierId={session.cashierId}
        cashierName={session.name}
        shiftId={activeShift.id}
        categories={(categoryRows ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          priceWeekday: Number(c.price_weekday),
          priceHoliday: Number(c.price_holiday),
          memberPrice: Number(c.member_price),
          groupMinQty: Number(c.group_min_qty),
          groupPrice: c.group_price == null ? null : Number(c.group_price),
        }))}
        members={(memberRows ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          phone: m.phone,
          memberCode: m.member_code,
          validFrom: m.valid_from,
          validUntil: m.valid_until,
        }))}
        taxRate={business.tax_enabled ? Number(business.tax_rate) : 0}
        serviceRate={business.service_enabled ? Number(business.service_rate) : 0}
        isHoliday={isHoliday}
        customPaymentMethods={(customPaymentMethodRowsForTiket ?? []).map((m) => m.name)}
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
