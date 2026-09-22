import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCashierSession } from "@/lib/cashier-session";
import { isTodayOnlyBusiness } from "../../(dashboard)/reports/period";
import PinScreen from "../pin-screen";
import ReportPrintScreen from "./report-print-screen";

// Versi ringan Halaman Laporan, khusus buat cetak Settlement/Menu dari Menu
// POS — dibuat terpisah dari (dashboard)/reports karena halaman backoffice
// itu sengaja disembunyikan dari app Android (lihat pos-screen.tsx: kasir
// cuma dikasih akses POS, bukan seluruh backoffice, sama seperti mode
// "Cashier" di Moka). Pola gating-nya sama seperti pos/printers/page.tsx.
export default async function PosReportsPage({
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

  // Sesi PIN kasir (bukan akun owner/staff) -- semua role (kasir, manajer,
  // pelayan) dikunci "Hari Ini" di bisnis yang minta pembatasan ini (lihat
  // isTodayOnlyBusiness), tidak dibedakan per role. Akses periode bebas
  // tetap ada lewat login owner/staff penuh di backoffice (bukan PIN POS).
  const periodLocked = isTodayOnlyBusiness(businessId);

  return (
    <ReportPrintScreen
      businessId={businessId}
      businessName={business.name}
      periodLocked={periodLocked}
    />
  );
}
