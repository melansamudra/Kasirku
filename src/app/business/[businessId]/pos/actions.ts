"use server";

import { createClient } from "@/lib/supabase/server";
import { setCashierSession, clearCashierSession } from "@/lib/cashier-session";

type VerifyCashierPinRow = {
  id: string;
  business_id: string;
  name: string;
  role: "kasir" | "manajer";
};

export async function verifyPin(
  businessId: string,
  cashierId: string,
  pin: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("verify_cashier_pin", { p_cashier_id: cashierId, p_pin: pin })
    .single();

  if (error || !data) {
    return { success: false, error: "PIN salah, coba lagi" };
  }

  const cashier = data as VerifyCashierPinRow;

  // Defensive check: this action is called with client-supplied arguments,
  // so don't trust businessId blindly even though the RPC already scopes
  // the cashier lookup to businesses the logged-in owner owns.
  if (cashier.business_id !== businessId) {
    return { success: false, error: "PIN salah, coba lagi" };
  }

  await setCashierSession({
    cashierId: cashier.id,
    businessId: cashier.business_id,
    name: cashier.name,
    role: cashier.role,
  });

  return { success: true };
}

export async function switchCashier() {
  await clearCashierSession();
}
