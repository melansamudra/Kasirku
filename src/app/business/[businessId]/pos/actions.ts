"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setCashierSession, clearCashierSession } from "@/lib/cashier-session";
import { logActivity } from "@/lib/activity-log";
import { buildKitchenPrintJobs, type KitchenPrintJobPayload } from "@/lib/kitchen-print";
import { buildKitchenTicket } from "@/lib/escpos";
import { buildReceiptBuffer } from "@/lib/receipt-print";

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

export type DiscountType = "pct" | "amt";

export type CartItemInput = {
  productId: string;
  qty: number;
  disc: number;
  discType: DiscountType;
};

export type CheckoutResult =
  | {
      success: true;
      invoiceNumber: string;
      transactionId: string;
      printJobs: KitchenPrintJobPayload[];
      receiptPrintJobs: KitchenPrintJobPayload[];
    }
  | { success: false; error: string };

type CheckoutRpcRow = { transaction_id: string; invoice_number: string; already_existed: boolean };

export async function checkout(
  businessId: string,
  cashierId: string,
  items: CartItemInput[],
  paymentMethod: string,
  received: number | null,
  orderDisc: number,
  orderDiscType: DiscountType,
  customerId: string | null = null,
  selfOrderIds: string[] = [],
  // Dibuat sekali di browser per penjualan (crypto.randomUUID()) dan dikirim
  // ulang apa adanya kalau ini retry dari antrian offline — RPC memakainya
  // untuk mengenali retry yang mengulang penjualan yang sebenarnya sudah
  // sukses (respons sebelumnya tidak sempat sampai ke browser), supaya tidak
  // membuat transaksi duplikat. Lihat src/hooks/use-offline-sync.ts.
  clientRef: string | null = null,
): Promise<CheckoutResult> {
  if (items.length === 0) {
    return { success: false, error: "Keranjang masih kosong." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("checkout_transaction", {
      p_business_id: businessId,
      p_cashier_id: cashierId,
      p_items: items.map((i) => ({
        product_id: i.productId,
        qty: i.qty,
        disc: i.disc,
        disc_type: i.discType,
      })),
      p_payment_method: paymentMethod,
      p_received: received,
      p_order_disc: orderDisc,
      p_order_disc_type: orderDiscType,
      p_customer_id: customerId,
      p_self_order_ids: selfOrderIds.length > 0 ? selfOrderIds : null,
      p_client_ref: clientRef,
    })
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal memproses transaksi." };
  }

  const result = data as CheckoutRpcRow;
  let printJobs: KitchenPrintJobPayload[] = [];
  let receiptPrintJobs: KitchenPrintJobPayload[] = [];

  // Retry offline yang ternyata sudah pernah sukses sebelumnya — jangan catat
  // aktivitas/cetak dapur dua kali untuk penjualan yang sama.
  if (!result.already_existed) {
    const itemCount = items.reduce((sum, i) => sum + i.qty, 0);
    await logActivity(
      supabase,
      businessId,
      "transaksi",
      "sukses",
      `Transaksi ${result.invoice_number}`,
      `${itemCount} item · ${paymentMethod}`,
    );

    printJobs = await buildKitchenPrintJobsForItems(
      supabase,
      businessId,
      "Kasir",
      result.invoice_number,
      items.map((i) => ({ productId: i.productId, qty: i.qty })),
    );

    receiptPrintJobs = await buildReceiptPrintJobsForTransaction(
      supabase,
      businessId,
      result.transaction_id,
    );
  }

  return {
    success: true,
    invoiceNumber: result.invoice_number,
    transactionId: result.transaction_id,
    printJobs,
    receiptPrintJobs,
  };
}

// Printer(s) flagged prints_receipt get the priced customer receipt
// automatically at checkout — no manual "Cetak Struk" click needed. Kept
// separate from printJobs (kitchen tickets) so callers can dispatch the
// receipt first: same physical printer sometimes handles both roles, and
// Bluetooth sockets don't like concurrent jobs to the same device.
async function buildReceiptPrintJobsForTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  transactionId: string,
): Promise<KitchenPrintJobPayload[]> {
  const { data: printers } = await supabase
    .from("kitchen_printers")
    .select("name, connection_type, address")
    .eq("business_id", businessId)
    .eq("prints_receipt", true)
    .not("address", "is", null);

  if (!printers || printers.length === 0) return [];

  const bufferResult = await buildReceiptBuffer(supabase, businessId, transactionId);
  if (!bufferResult.success) return [];

  const bytesBase64 = bufferResult.buffer.toString("base64");
  return printers.map((p) => ({
    printerName: p.name,
    address: p.address as string,
    connectionType: p.connection_type as "lan" | "bluetooth",
    bytesBase64,
  }));
}

async function buildKitchenPrintJobsForItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  source: string,
  label: string,
  items: { productId: string; qty: number; note?: string | null }[],
): Promise<KitchenPrintJobPayload[]> {
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const { data: products } = await supabase
    .from("products")
    .select("id, name, category")
    .in("id", productIds);
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  return buildKitchenPrintJobs(supabase, businessId, {
    source,
    label,
    items: items.map((i) => ({
      name: productMap.get(i.productId)?.name ?? "Item",
      category: productMap.get(i.productId)?.category ?? null,
      qty: i.qty,
      note: i.note,
    })),
  }).catch(() => []);
}

export async function logKitchenPrintFailures(
  businessId: string,
  failures: { printer: string; error: string }[],
) {
  if (failures.length === 0) return;
  const supabase = await createClient();
  await logActivity(
    supabase,
    businessId,
    "sistem",
    "warning",
    `Gagal cetak ke dapur: ${failures.map((f) => f.printer).join(", ")}`,
    failures.map((f) => f.error).join(" · "),
  );
}

export type BuildTestPrintJobResult =
  | { success: true; job: KitchenPrintJobPayload }
  | { success: false; error: string };

// One ticket, sent straight at a single chosen printer — no category
// routing, unlike buildKitchenPrintJobs (that one fans a real order out to
// every matching station). Used by the POS "Tes Cetak" screen.
export async function buildTestPrintJob(
  businessId: string,
  printerId: string,
): Promise<BuildTestPrintJobResult> {
  const supabase = await createClient();
  const { data: printer } = await supabase
    .from("kitchen_printers")
    .select("name, connection_type, address")
    .eq("id", printerId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!printer) {
    return { success: false, error: "Printer tidak ditemukan." };
  }
  if (!printer.address) {
    return { success: false, error: "Printer ini belum diatur alamat/perangkatnya." };
  }

  const buffer = buildKitchenTicket({
    station: printer.name,
    source: "Tes Cetak",
    label: new Date().toLocaleString("id-ID"),
    items: [{ name: "Ini tes cetak dari Kasirku", qty: 1 }],
  });

  return {
    success: true,
    job: {
      printerName: printer.name,
      address: printer.address,
      connectionType: printer.connection_type as "lan" | "bluetooth",
      bytesBase64: buffer.toString("base64"),
    },
  };
}

export type OpenShiftResult = { success: true } | { success: false; error: string };

export async function openShift(
  businessId: string,
  cashierId: string,
  openingCash: number,
  notes: string,
): Promise<OpenShiftResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_shift", {
    p_business_id: businessId,
    p_cashier_id: cashierId,
    p_opening_cash: openingCash,
    p_notes: notes || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    "Shift dibuka",
    `Kas awal Rp${openingCash.toLocaleString("id-ID")}`,
  );
  return { success: true };
}

export type CloseShiftSummary = {
  cash_sales: number;
  non_cash_sales: number;
  total_sales: number;
  expected_cash: number;
  difference: number;
  tx_count: number;
  void_count: number;
};

export type CloseShiftResult =
  | { success: true; summary: CloseShiftSummary }
  | { success: false; error: string };

export async function closeShift(
  businessId: string,
  shiftId: string,
  closingCash: number,
  closeNotes: string,
): Promise<CloseShiftResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("close_shift", {
      p_shift_id: shiftId,
      p_closing_cash: closingCash,
      p_close_notes: closeNotes || null,
    })
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal menutup shift." };
  }

  const summary = data as CloseShiftSummary;
  await logActivity(
    supabase,
    businessId,
    "sistem",
    summary.difference === 0 ? "info" : "warning",
    "Shift ditutup",
    `Penjualan Rp${summary.total_sales.toLocaleString("id-ID")} · ${summary.tx_count} transaksi · selisih Rp${summary.difference.toLocaleString("id-ID")}`,
  );
  return { success: true, summary };
}

export type CashMovementResult = { success: true } | { success: false; error: string };

export async function addShiftCashMovement(
  businessId: string,
  shiftId: string,
  direction: "in" | "out",
  amount: number,
  description: string,
): Promise<CashMovementResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_shift_cash_movement", {
    p_business_id: businessId,
    p_shift_id: shiftId,
    p_direction: direction,
    p_amount: amount,
    p_description: description,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    direction === "in" ? `Kas Masuk (shift): ${description}` : `Kas Keluar (shift): ${description}`,
    `Rp${amount.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/kas-harian`);
  return { success: true };
}

export type OpenBillItemInput = {
  product_id: string;
  name: string;
  price: number;
  qty: number;
  disc: number;
  disc_type: DiscountType;
};

export type SaveOpenBillResult =
  | { success: true; billId: string }
  | { success: false; error: string };

export async function saveOpenBill(
  businessId: string,
  billId: string | null,
  label: string,
  items: OpenBillItemInput[],
): Promise<SaveOpenBillResult> {
  const trimmed = label.trim();
  if (!trimmed) {
    return { success: false, error: "Nama bon wajib diisi." };
  }
  if (items.length === 0) {
    return { success: false, error: "Keranjang masih kosong." };
  }

  const supabase = await createClient();

  if (billId) {
    const { error } = await supabase
      .from("open_bills")
      .update({ label: trimmed, items, updated_at: new Date().toISOString() })
      .eq("id", billId)
      .eq("business_id", businessId);
    if (error) {
      return { success: false, error: error.message };
    }
    revalidatePath(`/business/${businessId}/pos`);
    return { success: true, billId };
  }

  const { data, error } = await supabase
    .from("open_bills")
    .insert({ business_id: businessId, label: trimmed, items })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal menyimpan bon." };
  }

  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "info",
    `Open Bill dibuat: ${trimmed}`,
    `${items.length} jenis item`,
  );
  revalidatePath(`/business/${businessId}/pos`);
  return { success: true, billId: data.id };
}

export async function deleteOpenBill(businessId: string, billId: string) {
  const supabase = await createClient();
  await supabase.from("open_bills").delete().eq("id", billId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/pos`);
}

export type SelfOrderPayload = {
  id: string;
  status: "baru" | "diproses";
  createdAt: string;
  tableName: string;
  items: { productId: string | null; name: string; qty: number; price: number; note: string | null }[];
};

// Dipakai oleh polling badge order masuk di pos-screen.tsx — dulu polling
// itu panggil router.refresh() tiap 15 detik, yang re-render SELURUH
// halaman POS (produk, open bill, customer, dst ikut di-fetch ulang).
// Action ini cuma ambil self_orders sendirian, jauh lebih ringan.
export async function getSelfOrders(businessId: string): Promise<SelfOrderPayload[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("self_orders")
    .select(
      "id, status, created_at, tables(name), self_order_items(product_id, name, qty, price, note)",
    )
    .eq("business_id", businessId)
    .neq("status", "selesai")
    .order("created_at", { ascending: true });

  return (
    data as unknown as {
      id: string;
      status: "baru" | "diproses";
      created_at: string;
      tables: { name: string } | null;
      self_order_items: { product_id: string | null; name: string; qty: number; price: number; note: string | null }[];
    }[]
    ?? []
  ).map((o) => ({
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
  }));
}

export async function updateSelfOrderStatus(
  businessId: string,
  orderId: string,
  status: "diproses" | "selesai",
): Promise<{ success: boolean; error?: string; printJobs?: KitchenPrintJobPayload[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("self_orders")
    .update({ status })
    .eq("id", orderId)
    .eq("business_id", businessId)
    .select("tables(name)")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  const tableName =
    (data as unknown as { tables: { name: string } | null }).tables?.name ?? "Meja terhapus";
  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "info",
    `Pesanan ${tableName} → ${status}`,
  );

  let printJobs: KitchenPrintJobPayload[] = [];

  if (status === "diproses") {
    const { data: orderItems } = await supabase
      .from("self_order_items")
      .select("product_id, name, qty, note, products(category)")
      .eq("self_order_id", orderId);

    if (orderItems && orderItems.length > 0) {
      printJobs = await buildKitchenPrintJobs(supabase, businessId, {
        source: tableName,
        label: "Pesanan Self-Order",
        items: orderItems.map((i) => ({
          name: i.name,
          category: (i as unknown as { products: { category: string | null } | null }).products
            ?.category ?? null,
          qty: Number(i.qty),
          note: i.note,
        })),
      }).catch(() => []);
    }
  }

  revalidatePath(`/business/${businessId}/pos`);
  revalidatePath(`/business/${businessId}/tables`);
  return { success: true, printJobs };
}
