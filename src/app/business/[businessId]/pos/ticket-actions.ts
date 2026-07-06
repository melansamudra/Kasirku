"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type TicketCartItemInput = {
  ticketCategoryId: string;
  qty: number;
};

export type CheckoutTicketResult =
  | { success: true; invoiceNumber: string; transactionId: string }
  | { success: false; error: string };

type CheckoutTicketRpcRow = { transaction_id: string; invoice_number: string };

export async function checkoutTicket(
  businessId: string,
  cashierId: string,
  items: TicketCartItemInput[],
  paymentMethod: string,
  received: number | null,
  memberId: string | null = null,
): Promise<CheckoutTicketResult> {
  if (items.length === 0) {
    return { success: false, error: "Keranjang masih kosong." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("checkout_ticket_transaction", {
      p_business_id: businessId,
      p_cashier_id: cashierId,
      p_items: items.map((i) => ({
        ticket_category_id: i.ticketCategoryId,
        qty: i.qty,
      })),
      p_payment_method: paymentMethod,
      p_received: received,
      p_member_id: memberId,
    })
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal memproses transaksi." };
  }

  const result = data as CheckoutTicketRpcRow;
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);
  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "sukses",
    `Tiket ${result.invoice_number}`,
    `${itemCount} tiket · ${paymentMethod}`,
  );

  return {
    success: true,
    invoiceNumber: result.invoice_number,
    transactionId: result.transaction_id,
  };
}

export type MemberLookupResult =
  | { success: true; member: { id: string; name: string; memberCode: string; validUntil: string } }
  | { success: false; error: string };

export async function lookupMemberByCode(
  businessId: string,
  code: string,
): Promise<MemberLookupResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { success: false, error: "Kode member wajib diisi." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, name, member_code, valid_from, valid_until")
    .eq("business_id", businessId)
    .eq("member_code", trimmed)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "Member tidak ditemukan." };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (today < data.valid_from || today > data.valid_until) {
    return { success: false, error: "Membership tidak aktif (kadaluarsa atau belum berlaku)." };
  }

  return {
    success: true,
    member: {
      id: data.id,
      name: data.name,
      memberCode: data.member_code,
      validUntil: data.valid_until,
    },
  };
}

export type VoidTicketResult = { success: true } | { success: false; error: string };

export async function voidTicketTransaction(
  businessId: string,
  transactionId: string,
  managerPin: string,
  reason: string,
): Promise<VoidTicketResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("void_ticket_transaction", {
      p_business_id: businessId,
      p_transaction_id: transactionId,
      p_manager_pin: managerPin,
      p_reason: reason || null,
    })
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal membatalkan transaksi." };
  }

  const row = data as { voided_by_name: string };
  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "warning",
    "Transaksi tiket dibatalkan",
    `Oleh ${row.voided_by_name}${reason ? ` · ${reason}` : ""}`,
  );

  return { success: true };
}
