"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setCashierSession, clearCashierSession } from "@/lib/cashier-session";
import { logActivity } from "@/lib/activity-log";
import { buildKitchenPrintJobs, type KitchenPrintJobPayload } from "@/lib/kitchen-print";
import { buildKitchenTicket, buildReceiptTicket } from "@/lib/escpos";

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

export type DiscountRule = {
  id: string;
  type: "per_product" | "promo";
  product_id: string | null;
  name: string | null;
  value: number;
  value_type: DiscountType;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
};

export type CartItemInput = {
  productId: string;
  qty: number;
  disc: number;
  discType: DiscountType;
  note?: string | null;
  unitPrice?: number; // harga satuan setelah opsi (override harga produk di DB)
  optionNames?: string[]; // label opsi yang dipilih — hanya untuk cetak dapur, tidak disimpan ke DB
};

export type TenderInput = {
  method: string;
  amount: number;
  received: number;
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
  payments: TenderInput[],
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
  // Dikirim dari client berdasarkan catalog yang sudah di-cache — kalau false,
  // skip seluruh blok build-print-jobs supaya tidak ada query DB percuma.
  hasPrinters: boolean = true,
  hasReceiptPrinters: boolean = true,
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
        note: i.note ?? null,
        ...(i.unitPrice ? { unit_price: i.unitPrice } : {}),
      })),
      p_payments: payments,
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

    // Tiga hal ini tidak saling bergantung — dulu dijalankan berurutan
    // (await satu-satu), menambah beberapa detik nyata ke waktu konfirmasi
    // pembayaran di jaringan mobile. Sekarang jalan bersamaan.
    // hasPrinters/hasReceiptPrinters dikirim dari client berdasarkan catalog
    // cache — kalau false, skip query DB printer supaya checkout lebih cepat
    // bagi bisnis yang belum punya printer dapur/struk.
    const [, printJobsResult, receiptJobsResult] = await Promise.all([
      logActivity(
        supabase,
        businessId,
        "transaksi",
        "sukses",
        `Transaksi ${result.invoice_number}`,
        `${itemCount} item · ${payments.map((p) => p.method).join(", ")}`,
      ),
      hasPrinters
        ? buildKitchenPrintJobsForItems(
            supabase,
            businessId,
            "Kasir",
            result.invoice_number,
            items.map((i) => ({
              productId: i.productId,
              qty: i.qty,
              note: [
                ...(i.optionNames ?? []),
                i.note ?? null,
              ].filter((x): x is string => !!x).join(" · ") || null,
            })),
            undefined,
            cashierId,
            "NEW ORDER",
          )
        : Promise.resolve([]),
      hasReceiptPrinters
        ? buildReceiptPrintJobsForTransaction(supabase, businessId, result.transaction_id)
        : Promise.resolve([]),
    ]);
    printJobs = printJobsResult;
    receiptPrintJobs = receiptJobsResult;
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
//
// Fetches printers + all receipt data in one parallel batch (previously 2
// serial round trips: printers first, then receipt data).
async function buildReceiptPrintJobsForTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  transactionId: string,
): Promise<KitchenPrintJobPayload[]> {
  const [
    { data: printers },
    { data: business },
    { data: transaction },
    { data: items },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from("kitchen_printers")
      .select("name, connection_type, address, paper_width")
      .eq("business_id", businessId)
      .eq("prints_receipt", true)
      .not("address", "is", null),
    supabase
      .from("businesses")
      .select("name, address, phone, receipt_settings")
      .eq("id", businessId)
      .single(),
    supabase
      .from("transactions")
      .select("invoice_number, date, subtotal_raw, service, tax, total_item_disc, order_disc_amt, total, voided, cashiers!transactions_cashier_id_fkey(name)")
      .eq("id", transactionId)
      .eq("business_id", businessId)
      .single(),
    supabase
      .from("transaction_items")
      .select("id, name, price, qty, note")
      .eq("transaction_id", transactionId)
      .order("id", { ascending: true }),
    supabase
      .from("transaction_payments")
      .select("method, amount, received, change")
      .eq("transaction_id", transactionId),
  ]);

  if (!printers || printers.length === 0) return [];
  if (!business || !transaction) return [];

  const date = new Date(transaction.date).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  const receiptItems = (items ?? []).map((i) => ({
    name: i.name,
    qty: Number(i.qty),
    price: Number(i.price),
    note: (i as unknown as { note?: string | null }).note,
  }));
  const receiptPayments = (payments ?? []).map((p) => ({
    method: p.method,
    amount: Number(p.amount),
    received: p.received === null ? null : Number(p.received),
    change: p.change === null ? null : Number(p.change),
  }));

  const jobs: KitchenPrintJobPayload[] = [];
  for (const p of printers) {
    const paperWidth = (p as unknown as { paper_width?: number }).paper_width ?? 58;
    const buffer = buildReceiptTicket({
      businessName: business.name,
      businessAddress: (business as unknown as { address?: string | null }).address,
      businessPhone: (business as unknown as { phone?: string | null }).phone,
      invoiceNumber: transaction.invoice_number,
      date,
      cashierName: (transaction.cashiers as unknown as { name: string } | null)?.name ?? "—",
      voided: transaction.voided,
      items: receiptItems,
      subtotal: Number(transaction.subtotal_raw),
      itemDiscount: Number(transaction.total_item_disc),
      orderDiscount: Number(transaction.order_disc_amt),
      service: Number(transaction.service),
      tax: Number(transaction.tax),
      total: Number(transaction.total),
      payments: receiptPayments,
      settings: (business as unknown as { receipt_settings?: object }).receipt_settings as import("@/lib/escpos").ReceiptSettings | undefined,
      paperWidth,
    });
    jobs.push({
      printerName: p.name,
      address: p.address as string,
      connectionType: p.connection_type as "lan" | "bluetooth",
      bytesBase64: buffer.toString("base64"),
    });
  }
  return jobs;
}

// Fetches products + cashier + kitchen printers in one parallel batch
// (previously 2 serial round trips: products+cashier, then printers inside
// buildKitchenPrintJobs). Inlines the routing logic from kitchen-print.ts.
async function buildKitchenPrintJobsForItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  source: string,
  label: string,
  items: { productId: string; qty: number; note?: string | null }[],
  orderType?: string,
  cashierId?: string,
  title?: string,
): Promise<KitchenPrintJobPayload[]> {
  if (items.length === 0) return [];

  const productIds = Array.from(new Set(items.map((i) => i.productId)));

  const [{ data: products }, cashierRow, { data: printers }] = await Promise.all([
    supabase.from("products").select("id, name, variant_label, category").in("id", productIds),
    cashierId
      ? supabase.from("cashiers").select("name").eq("id", cashierId).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("kitchen_printers")
      .select("id, name, categories, connection_type, address, prints_receipt, paper_width")
      .eq("business_id", businessId),
  ]);

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  const cashierName = (cashierRow.data as { name?: string } | null)?.name;

  const mappedItems = items.map((i) => {
    const p = productMap.get(i.productId);
    const baseName = p?.name ?? "Item";
    const variantLabel = (p as unknown as { variant_label?: string | null } | undefined)?.variant_label;
    return {
      name: variantLabel ? `${baseName} (${variantLabel})` : baseName,
      category: p?.category ?? null,
      qty: i.qty,
      note: i.note,
    };
  });

  const addressedPrinters = (printers ?? []).filter(
    (p) => !!p.address && !p.prints_receipt,
  ) as {
    id: string;
    name: string;
    categories: string[];
    connection_type: "lan" | "bluetooth";
    address: string;
    paper_width: number;
  }[];

  const attempts = addressedPrinters
    .map((printer) => {
      const routed =
        printer.categories.length > 0
          ? mappedItems.filter((i) => i.category && printer.categories.includes(i.category))
          : mappedItems;
      return { printer, items: routed };
    })
    .filter((a) => a.items.length > 0);

  return attempts.map(({ printer, items: ticketItems }) => {
    const buffer = buildKitchenTicket({
      station: printer.name,
      source,
      label,
      title,
      items: ticketItems,
      cashierName,
      orderType,
      paperWidth: printer.paper_width ?? 58,
    });
    return {
      printerName: printer.name,
      address: printer.address,
      connectionType: printer.connection_type,
      bytesBase64: buffer.toString("base64"),
    };
  });
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

// Dipanggil sekali saat sebuah job yang sempat gagal akhirnya berhasil
// dicetak lewat antrian retry (retryPendingPrintJobs) — supaya kasir tahu
// tiket yang tadi hilang sudah tercetak, bukan diam-diam ditelan sistem.
export async function logPrintQueueRecovered(businessId: string, printerName: string) {
  const supabase = await createClient();
  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    `Struk tertunda berhasil dicetak: ${printerName}`,
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
    .select("name, connection_type, address, prints_receipt, paper_width")
    .eq("id", printerId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!printer) {
    return { success: false, error: "Printer tidak ditemukan." };
  }
  if (!printer.address) {
    return { success: false, error: "Printer ini belum diatur alamat/perangkatnya." };
  }

  const paperWidth = (printer as unknown as { paper_width?: number }).paper_width ?? 58;
  const isReceipt = (printer as unknown as { prints_receipt?: boolean }).prints_receipt === true;

  let buffer: Buffer;
  if (isReceipt) {
    const { data: business } = await supabase
      .from("businesses")
      .select("name, address, phone, receipt_settings")
      .eq("id", businessId)
      .single();
    const biz = business as unknown as {
      name?: string;
      address?: string | null;
      phone?: string | null;
      receipt_settings?: import("@/lib/escpos").ReceiptSettings;
    } | null;
    buffer = buildReceiptTicket({
      businessName: biz?.name ?? "Nama Bisnis",
      businessAddress: biz?.address ?? null,
      businessPhone: biz?.phone ?? null,
      invoiceNumber: "TES-CETAK",
      date: new Date().toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }),
      cashierName: "Kasir",
      voided: false,
      items: [
        { name: "Kopi Susu", qty: 2, price: 25000 },
        { name: "Teh Tarik", qty: 1, price: 18000 },
        { name: "Es Teh Manis", qty: 1, price: 8000 },
      ],
      subtotal: 76000,
      itemDiscount: 0,
      orderDiscount: 0,
      service: 0,
      tax: 0,
      total: 76000,
      payments: [{ method: "Tunai", amount: 76000, received: 80000, change: 4000 }],
      settings: {
        ...(biz?.receipt_settings ?? {}),
        show_address: !!(biz?.address),
        show_phone: !!(biz?.phone),
      },
      paperWidth,
    });
  } else {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    buffer = buildKitchenTicket({
      station: printer.name,
      source: "Tes Cetak",
      label: timeStr,
      title: "TES CETAK",
      items: [{ name: "Ini tes cetak dari Kasirku", qty: 1 }],
      paperWidth,
    });
  }

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
  | { success: true; billId: string; printJobs: KitchenPrintJobPayload[] }
  | { success: false; error: string };

export async function saveOpenBill(
  businessId: string,
  billId: string | null,
  label: string,
  items: OpenBillItemInput[],
  cashierId?: string,
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
    const printJobs = await buildKitchenPrintJobsForItems(
      supabase, businessId, trimmed, "Tambahan Order", items.map((i) => ({ productId: i.product_id, qty: i.qty })), undefined, cashierId, "ADDITIONAL ORDER",
    ).catch(() => []);
    return { success: true, billId, printJobs };
  }

  const { data, error } = await supabase
    .from("open_bills")
    .insert({ business_id: businessId, label: trimmed, items })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal menyimpan bon." };
  }

  revalidatePath(`/business/${businessId}/pos`);
  // logActivity and print-job building are independent — run in parallel
  const [printJobs] = await Promise.all([
    buildKitchenPrintJobsForItems(
      supabase, businessId, trimmed, "New Order", items.map((i) => ({ productId: i.product_id, qty: i.qty })), undefined, cashierId, "NEW ORDER",
    ).catch(() => []),
    logActivity(supabase, businessId, "transaksi", "info", `Open Bill dibuat: ${trimmed}`, `${items.length} jenis item`),
  ]);
  return { success: true, billId: data.id, printJobs };
}

export async function deleteOpenBill(businessId: string, billId: string) {
  const supabase = await createClient();
  await supabase.from("open_bills").delete().eq("id", billId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/pos`);
}

export type PosProduct = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  cost: number;
  stock: number;
  emoji: string | null;
  barcode: string | null;
  sku: string | null;
  variant_label: string | null;
  image_url: string | null;
  show_in_self_order: boolean;
};

export type PosOpenBill = {
  id: string;
  label: string;
  updated_at: string;
  items: {
    product_id: string;
    name: string;
    price: number;
    qty: number;
    disc: number;
    disc_type: DiscountType;
  }[];
};

export type PosCustomer = { id: string; name: string; phone: string | null };

export type PosProductOption = { id: string; name: string; price_adjustment: number; sort_order: number };
export type PosOptionGroup = {
  id: string;
  product_id: string;
  name: string;
  required: boolean;
  sort_order: number;
  options: PosProductOption[];
};

export type PosCatalog = {
  products: PosProduct[];
  openBills: PosOpenBill[];
  customers: PosCustomer[];
  customPaymentMethods: string[];
  discountRules: DiscountRule[];
  hasKitchenPrinters: boolean;
  hasReceiptPrinters: boolean;
  selfOrderEnabled: boolean;
  optionGroups: PosOptionGroup[];
};

// Sumber tunggal data katalog POS (produk/open bill/customer/metode bayar
// custom) — dipakai baik untuk render server pertama kali (pos/page.tsx)
// maupun refresh di background dari client (pos-screen.tsx, lihat
// pos-cache.ts). Sengaja tidak termasuk self_orders — itu sudah punya jalur
// polling sendiri (getSelfOrders di bawah).
export async function getPosCatalog(businessId: string): Promise<PosCatalog> {
  const supabase = await createClient();

  const [
    { data: products },
    { data: openBillRows },
    { data: customers },
    { data: customPaymentMethodRows },
    { data: discountRuleRows },
    { data: printerRows },
    { data: businessRow },
    { data: optionGroupRows },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, category, price, cost, stock, emoji, barcode, sku, variant_label, image_url, show_in_self_order")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("open_bills")
      .select("id, label, items, updated_at")
      .eq("business_id", businessId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("customers")
      .select("id, name, phone")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("custom_payment_methods")
      .select("name")
      .eq("business_id", businessId)
      .order("name", { ascending: true }),
    supabase
      .from("discount_rules")
      .select("id, type, product_id, name, value, value_type, active, valid_from, valid_until")
      .eq("business_id", businessId),
    supabase
      .from("kitchen_printers")
      .select("prints_receipt")
      .eq("business_id", businessId)
      .not("address", "is", null),
    supabase
      .from("businesses")
      .select("self_order_enabled")
      .eq("id", businessId)
      .single(),
    supabase
      .from("product_option_groups")
      .select("id, product_id, name, required, sort_order, product_options(id, name, price_adjustment, sort_order)")
      .in("product_id",
        // akan diisi setelah produk di-load; pakai subquery via join tidak tersedia di Supabase JS,
        // jadi kita ambil semua grup milik bisnis lewat join ke products
        (await supabase
          .from("products")
          .select("id")
          .eq("business_id", businessId)
          .is("deleted_at", null)
          .then((r) => (r.data ?? []).map((p) => p.id)))
      )
      .order("sort_order", { ascending: true }),
  ]);

  const printers = printerRows ?? [];

  const rawGroups = (optionGroupRows ?? []) as {
    id: string; product_id: string; name: string; required: boolean; sort_order: number;
    product_options: { id: string; name: string; price_adjustment: number; sort_order: number }[];
  }[];

  const optionGroups: PosOptionGroup[] = rawGroups.map((g) => ({
    id: g.id,
    product_id: g.product_id,
    name: g.name,
    required: g.required,
    sort_order: g.sort_order,
    options: [...(g.product_options ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));

  return {
    products: (products ?? []) as PosProduct[],
    openBills: (openBillRows ?? []) as unknown as PosOpenBill[],
    customers: customers ?? [],
    customPaymentMethods: (customPaymentMethodRows ?? []).map((m) => m.name),
    discountRules: (discountRuleRows ?? []) as DiscountRule[],
    hasKitchenPrinters: printers.some((p) => !p.prints_receipt),
    hasReceiptPrinters: printers.some((p) => p.prints_receipt),
    selfOrderEnabled: (businessRow as { self_order_enabled: boolean } | null)?.self_order_enabled !== false,
    optionGroups,
  };
}

export type SelfOrderPayload = {
  id: string;
  status: "baru" | "diproses";
  createdAt: string;
  tableName: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
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
      "id, status, created_at, customer_name, customer_phone, payment_method, tables(name), self_order_items(product_id, name, qty, price, note)",
    )
    .eq("business_id", businessId)
    .neq("status", "selesai")
    .order("created_at", { ascending: true });

  return (
    data as unknown as {
      id: string;
      status: "baru" | "diproses";
      created_at: string;
      customer_name: string | null;
      customer_phone: string | null;
      payment_method: string | null;
      tables: { name: string } | null;
      self_order_items: { product_id: string | null; name: string; qty: number; price: number; note: string | null }[];
    }[]
    ?? []
  ).map((o) => ({
    id: o.id,
    status: o.status,
    createdAt: o.created_at,
    tableName: o.tables?.name ?? "Meja terhapus",
    customerName: o.customer_name ?? null,
    customerPhone: o.customer_phone ?? null,
    paymentMethod: o.payment_method ?? null,
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
        title: "NEW ORDER",
        orderType: "DINE IN",
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

export type ShiftTransaction = {
  id: string;
  invoice_number: string;
  created_at: string;
  total: number;
  items: { name: string; qty: number }[];
};

export type VoidPosResult =
  | { success: true; voidedByName: string }
  | { success: false; error: string };

export async function getShiftTransactions(
  businessId: string,
  shiftId: string,
): Promise<ShiftTransaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("id, invoice_number, created_at, total, transaction_items(name, qty)")
    .eq("business_id", businessId)
    .eq("shift_id", shiftId)
    .eq("voided", false)
    .order("created_at", { ascending: false })
    .limit(30);

  return (data ?? []).map((t) => ({
    id: t.id as string,
    invoice_number: t.invoice_number as string,
    created_at: t.created_at as string,
    total: t.total as number,
    items: (t.transaction_items as { name: string; qty: number }[]) ?? [],
  }));
}

export async function voidPosTransaction(
  businessId: string,
  transactionId: string,
  managerPin: string,
  reason: string,
): Promise<VoidPosResult> {
  if (!managerPin.trim()) {
    return { success: false, error: "PIN manajer wajib diisi." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("void_transaction", {
    p_business_id: businessId,
    p_transaction_id: transactionId,
    p_manager_pin: managerPin,
    p_reason: reason.trim() || null,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("pin") || msg.includes("otorisasi")) {
      return { success: false, error: "PIN manajer salah atau tidak memiliki otorisasi." };
    }
    if (msg.includes("sudah dibatalkan")) {
      return { success: false, error: "Transaksi ini sudah dibatalkan sebelumnya." };
    }
    return { success: false, error: "Gagal membatalkan transaksi." };
  }

  const rows = data as { voided_by_name: string }[] | null;
  const voidedByName = rows?.[0]?.voided_by_name ?? "Manajer";

  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "warning",
    "Transaksi dibatalkan (void)",
    `Dibatalkan oleh ${voidedByName}${reason.trim() ? ` · ${reason.trim()}` : ""}`,
  );

  return { success: true, voidedByName };
}

export async function setSelfOrderEnabled(
  businessId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("businesses")
    .update({ self_order_enabled: enabled })
    .eq("id", businessId);
  revalidatePath(`/business/${businessId}/pos`);
}

export async function toggleSelfOrderVisibility(
  businessId: string,
  productId: string,
  show: boolean,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("products")
    .update({ show_in_self_order: show })
    .eq("id", productId)
    .eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/pos`);
  revalidatePath(`/business/${businessId}/tables`);
}
