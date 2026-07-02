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

export type CartItemInput = { productId: string; qty: number };

export type CheckoutResult =
  | { success: true; invoiceNumber: string }
  | { success: false; error: string };

type CheckoutRpcRow = { transaction_id: string; invoice_number: string };

export async function checkout(
  businessId: string,
  cashierId: string,
  items: CartItemInput[],
  paymentMethod: string,
  received: number | null,
): Promise<CheckoutResult> {
  if (items.length === 0) {
    return { success: false, error: "Keranjang masih kosong." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("checkout_transaction", {
      p_business_id: businessId,
      p_cashier_id: cashierId,
      p_items: items.map((i) => ({ product_id: i.productId, qty: i.qty })),
      p_payment_method: paymentMethod,
      p_received: received,
    })
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal memproses transaksi." };
  }

  const result = data as CheckoutRpcRow;
  return { success: true, invoiceNumber: result.invoice_number };
}
