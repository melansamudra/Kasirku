"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import { logActivity } from "@/lib/activity-log";
import { buildReceiptBuffer } from "@/lib/receipt-print";
import { buildKitchenPrintJobs, type KitchenPrintJobPayload } from "@/lib/kitchen-print";

export type BuildReceiptPrintJobResult =
  | { success: true; job: KitchenPrintJobPayload }
  | { success: false; error: string };

// Customer receipt (struk kasir, with prices) sent straight to a chosen
// LAN/Bluetooth printer via the native plugin — a separate path from the
// window.print() button, since Android's OS-level print framework generally
// can't drive cheap ESC/POS thermal printers like the ones used for kitchen
// tickets. Reuses whatever printers are configured under Printer Dapur &
// Bar; there's no separate "cashier printer" list. Also used by checkout()
// to auto-print to any printer flagged prints_receipt — see kitchen-print.ts.
export async function buildReceiptPrintJob(
  businessId: string,
  transactionId: string,
  printerId: string,
): Promise<BuildReceiptPrintJobResult> {
  const supabase = await createClient();

  // Fetch printer first so we can pass its paper_width to buildReceiptBuffer —
  // the two calls can't be parallel because buffer formatting depends on the
  // printer's paper width (58mm → 26 cols, 80mm → 42 cols).
  const { data: printer } = await supabase
    .from("kitchen_printers")
    .select("name, connection_type, address, paper_width")
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
  const bufferResult = await buildReceiptBuffer(supabase, businessId, transactionId, paperWidth);

  if (!bufferResult.success) {
    return { success: false, error: bufferResult.error };
  }

  return {
    success: true,
    job: {
      printerName: printer.name,
      address: printer.address,
      connectionType: printer.connection_type as "lan" | "bluetooth",
      bytesBase64: bufferResult.buffer.toString("base64"),
    },
  };
}

export type BuildKitchenReprintResult =
  | { success: true; jobs: KitchenPrintJobPayload[] }
  | { success: false; error: string };

// Cetak ulang tiket dapur/bar untuk transaksi yang sudah lewat — mis.
// printer mati saat checkout & tidak sempat masuk antrian retry
// (print-queue.ts), atau tiketnya hilang/rusak. category sudah tersimpan
// per baris di transaction_items sejak checkout, jadi tidak perlu join ulang
// ke products — langsung pakai buildKitchenPrintJobs seperti checkout().
export async function buildKitchenReprintJobs(
  businessId: string,
  transactionId: string,
): Promise<BuildKitchenReprintResult> {
  const supabase = await createClient();

  const [{ data: transaction }, { data: items }] = await Promise.all([
    supabase
      .from("transactions")
      .select("invoice_number")
      .eq("id", transactionId)
      .eq("business_id", businessId)
      .single(),
    supabase
      .from("transaction_items")
      .select("name, category, qty")
      .eq("transaction_id", transactionId)
      .order("id", { ascending: true }),
  ]);

  if (!transaction) {
    return { success: false, error: "Transaksi tidak ditemukan." };
  }

  const jobs = await buildKitchenPrintJobs(supabase, businessId, {
    source: "Cetak Ulang",
    label: transaction.invoice_number,
    items: (items ?? []).map((i) => ({ name: i.name, category: i.category, qty: Number(i.qty) })),
  });

  return { success: true, jobs };
}

export type ImportTransactionsState = {
  error: string | null;
  result: { created: number; skipped: number; errors: string[] } | null;
};

// One CSV row = one line item; rows sharing the same "Referensi" are grouped
// into a single multi-item transaction (transactions have many items, unlike
// products' one-row-one-entity import). Product/customer must already exist
// — this doesn't auto-create them, unlike importProducts.
const IMPORT_COLUMNS = ["reference", "date", "productName", "qty", "paymentMethod", "customerName"] as const;

export async function importTransactions(
  businessId: string,
  _prevState: ImportTransactionsState,
  formData: FormData,
): Promise<ImportTransactionsState> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Pilih file CSV dulu.", result: null };
  }

  const text = await file.text();
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) {
    return { error: "File CSV kosong atau cuma berisi header.", result: null };
  }

  const dataRows = rows.slice(1);
  const supabase = await createClient();

  const [{ data: products }, { data: customers }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name")
      .eq("business_id", businessId)
      .is("deleted_at", null),
    supabase
      .from("customers")
      .select("id, name")
      .eq("business_id", businessId)
      .is("deleted_at", null),
  ]);

  const productIdByName = new Map(
    (products ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]),
  );
  const customerIdByName = new Map(
    (customers ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]),
  );

  type ParsedRow = {
    line: number;
    reference: string;
    date: string;
    productName: string;
    qty: number;
    paymentMethod: string;
    customerName: string;
  };

  const errors: string[] = [];
  const groups = new Map<string, ParsedRow[]>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const line = i + 2;
    const get = (col: (typeof IMPORT_COLUMNS)[number]) =>
      row[IMPORT_COLUMNS.indexOf(col)]?.trim() || "";

    const reference = get("reference");
    if (!reference) {
      errors.push(`Baris ${line}: Referensi kosong`);
      continue;
    }
    const date = get("date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Baris ${line}: tanggal harus format YYYY-MM-DD`);
      continue;
    }
    const productName = get("productName");
    if (!productName) {
      errors.push(`Baris ${line}: nama produk kosong`);
      continue;
    }
    const qty = Number(get("qty"));
    if (!get("qty") || Number.isNaN(qty) || qty <= 0) {
      errors.push(`Baris ${line}: qty tidak valid`);
      continue;
    }
    const paymentMethod = get("paymentMethod");
    if (!paymentMethod) {
      errors.push(`Baris ${line}: metode bayar kosong`);
      continue;
    }
    const customerName = get("customerName");

    const list = groups.get(reference) ?? [];
    list.push({ line, reference, date, productName, qty, paymentMethod, customerName });
    groups.set(reference, list);
  }

  let created = 0;
  let skipped = 0;

  for (const [reference, groupRows] of groups) {
    const first = groupRows[0];
    const mismatched = groupRows.find(
      (r) =>
        r.date !== first.date ||
        r.paymentMethod !== first.paymentMethod ||
        r.customerName !== first.customerName,
    );
    if (mismatched) {
      skipped += groupRows.length;
      errors.push(
        `Referensi "${reference}": tanggal/metode bayar/pelanggan tidak konsisten antar baris (baris ${mismatched.line})`,
      );
      continue;
    }

    let customerId: string | null = null;
    if (first.customerName) {
      customerId = customerIdByName.get(first.customerName.toLowerCase()) ?? null;
      if (!customerId) {
        skipped += groupRows.length;
        errors.push(`Referensi "${reference}": pelanggan "${first.customerName}" tidak ditemukan`);
        continue;
      }
    }

    const items: { product_id: string; qty: number }[] = [];
    let productMissing = false;
    for (const r of groupRows) {
      const productId = productIdByName.get(r.productName.toLowerCase());
      if (!productId) {
        errors.push(`Baris ${r.line}: produk "${r.productName}" tidak ditemukan`);
        productMissing = true;
        continue;
      }
      items.push({ product_id: productId, qty: r.qty });
    }
    if (productMissing || items.length === 0) {
      skipped += groupRows.length;
      continue;
    }

    const { error } = await supabase.rpc("create_manual_transaction", {
      p_business_id: businessId,
      p_date: new Date(`${first.date}T12:00:00`).toISOString(),
      p_items: items,
      p_payment_method: first.paymentMethod,
      p_received: null,
      p_customer_id: customerId,
    });

    if (error) {
      skipped += groupRows.length;
      errors.push(`Referensi "${reference}": ${error.message}`);
      continue;
    }

    created++;
  }

  if (created > 0) {
    await logActivity(
      supabase,
      businessId,
      "transaksi",
      "sukses",
      `Impor transaksi: ${created} transaksi baru`,
      skipped > 0 ? `${skipped} baris dilewati` : undefined,
    );
    revalidatePath(`/business/${businessId}/transactions`);
  }

  return { error: null, result: { created, skipped, errors } };
}

// ─── Moka POS Import ────────────────────────────────────────────────────────

type MokaTxParsed = {
  reference: string;
  date: string;
  items: { productName: string; qty: number }[];
  paymentMethod: string;
  customerName: string;
};

export type MokaPreviewState = {
  error: string | null;
  preview: {
    matched: string[];
    unmatched: string[];
    willImport: number;
    willSkip: number;
    txJson: string;
  } | null;
};

export type MokaImportState = {
  error: string | null;
  result: { created: number; skipped: number; errors: string[] } | null;
};

function parseTsv(text: string): string[][] {
  const s = text.startsWith(String.fromCharCode(0xfeff)) ? text.slice(1) : text;
  return s
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split("\t"));
}

function parseMokaItems(itemsStr: string): { productName: string; qty: number }[] {
  if (!itemsStr.trim()) return [];
  return itemsStr
    .split(", ")
    .map((part) => {
      const m = part.match(/^(.+?)\s+x\s+(\d+)$/);
      if (m) return { productName: m[1].trim(), qty: Number(m[2]) };
      return { productName: part.trim(), qty: 1 };
    })
    .filter((i) => i.productName.length > 0);
}

export async function previewMokaImport(
  businessId: string,
  _prevState: MokaPreviewState,
  formData: FormData,
): Promise<MokaPreviewState> {
  const fail = (msg: string): MokaPreviewState => ({ error: msg, preview: null });

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return fail("Pilih file dulu.");

  const text = await file.text();
  const rows = parseTsv(text);
  if (rows.length < 2) return fail("File kosong atau tidak valid.");

  const headers = rows[0].map((h) => h.trim());
  const col = (name: string) => headers.indexOf(name);

  const COL_DATE = col("Date");
  const COL_TIME = col("Time");
  const COL_RECEIPT = col("Receipt Number");
  const COL_CUSTOMER = col("Customer");
  const COL_ITEMS = col("Items");
  const COL_PAYMENT = col("Payment Method");
  const COL_EVENT = col("Event Type");

  if ([COL_DATE, COL_RECEIPT, COL_ITEMS, COL_PAYMENT, COL_EVENT].some((i) => i === -1)) {
    return fail("Format tidak dikenali. Pastikan ini file ekspor Moka POS.");
  }

  const dataRows = rows.slice(1).filter((r) => r[COL_EVENT]?.trim() === "Payment");
  if (dataRows.length === 0) return fail("Tidak ada data transaksi ditemukan di file ini.");

  const transactions: MokaTxParsed[] = [];

  for (const row of dataRows) {
    const reference = row[COL_RECEIPT]?.trim();
    const dateStr = row[COL_DATE]?.trim();
    const timeStr = row[COL_TIME]?.trim() || "12:00:00";
    const itemsStr = row[COL_ITEMS]?.trim();
    const paymentMethod = row[COL_PAYMENT]?.trim() || "Tunai";
    const customerName = row[COL_CUSTOMER]?.trim() || "";

    if (!reference || !dateStr || !itemsStr) continue;

    const parts = dateStr.split("/");
    if (parts.length !== 3) continue;
    const [day, month, year] = parts;
    const date = new Date(`${year}-${month}-${day}T${timeStr}+07:00`).toISOString();

    const items = parseMokaItems(itemsStr);
    if (items.length === 0) continue;

    transactions.push({ reference, date, items, paymentMethod, customerName });
  }

  const allNames = new Set<string>();
  for (const tx of transactions) {
    for (const item of tx.items) allNames.add(item.productName);
  }

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("name")
    .eq("business_id", businessId)
    .is("deleted_at", null);

  const productNames = new Set((products ?? []).map((p) => p.name.trim().toLowerCase()));

  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const name of allNames) {
    if (productNames.has(name.toLowerCase())) matched.push(name);
    else unmatched.push(name);
  }

  const unmatchedSet = new Set(unmatched.map((n) => n.toLowerCase()));
  let willImport = 0;
  let willSkip = 0;
  for (const tx of transactions) {
    const hasUnmatched = tx.items.some((i) => unmatchedSet.has(i.productName.toLowerCase()));
    if (hasUnmatched) willSkip++;
    else willImport++;
  }

  return {
    error: null,
    preview: {
      matched,
      unmatched,
      willImport,
      willSkip,
      txJson: JSON.stringify(transactions),
    },
  };
}

export async function importFromMoka(
  businessId: string,
  _prevState: MokaImportState,
  formData: FormData,
): Promise<MokaImportState> {
  const fail = (msg: string): MokaImportState => ({ error: msg, result: null });

  const txJson = formData.get("txJson") as string;
  if (!txJson) return fail("Data tidak valid.");

  let transactions: MokaTxParsed[];
  try {
    transactions = JSON.parse(txJson) as MokaTxParsed[];
  } catch {
    return fail("Data tidak valid.");
  }

  const supabase = await createClient();
  const [{ data: products }, { data: customers }] = await Promise.all([
    supabase.from("products").select("id, name").eq("business_id", businessId).is("deleted_at", null),
    supabase.from("customers").select("id, name").eq("business_id", businessId).is("deleted_at", null),
  ]);

  const productIdByName = new Map((products ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]));
  const customerIdByName = new Map((customers ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]));

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const tx of transactions) {
    const items: { product_id: string; qty: number }[] = [];
    let missing = false;

    for (const item of tx.items) {
      const productId = productIdByName.get(item.productName.toLowerCase());
      if (!productId) {
        errors.push(`"${tx.reference}": produk "${item.productName}" tidak ditemukan`);
        missing = true;
        break;
      }
      items.push({ product_id: productId, qty: item.qty });
    }

    if (missing || items.length === 0) {
      skipped++;
      continue;
    }

    let customerId: string | null = null;
    if (tx.customerName) {
      customerId = customerIdByName.get(tx.customerName.toLowerCase()) ?? null;
    }

    const { error } = await supabase.rpc("create_manual_transaction", {
      p_business_id: businessId,
      p_date: tx.date,
      p_items: items,
      p_payment_method: tx.paymentMethod,
      p_received: null,
      p_customer_id: customerId,
    });

    if (error) {
      skipped++;
      errors.push(`"${tx.reference}": ${error.message}`);
    } else {
      created++;
    }
  }

  if (created > 0) {
    await logActivity(supabase, businessId, "transaksi", "sukses",
      `Impor Moka POS: ${created} transaksi`, skipped > 0 ? `${skipped} dilewati` : undefined);
    revalidatePath(`/business/${businessId}/transactions`);
  }

  return { error: null, result: { created, skipped, errors } };
}
