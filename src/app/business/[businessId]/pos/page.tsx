import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCashierSession } from "@/lib/cashier-session";
import PinScreen from "./pin-screen";
import SwitchCashierButton from "./switch-cashier-button";

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

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 text-center">
        <h1 className="text-lg font-bold text-zinc-900">Halo, {session.name} 👋</h1>
        <p className="mt-1 text-xs text-zinc-500">
          {session.role === "manajer" ? "Manajer" : "Kasir"} — {business.name}
        </p>
        <p className="mt-4 text-xs text-zinc-400">
          Layar jual-beli (produk, keranjang, checkout) masih tahap berikutnya.
        </p>
        <SwitchCashierButton />
      </div>
    </div>
  );
}
