"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import { logActivity } from "@/lib/activity-log";
import { buildReceiptBuffer } from "@/lib/receipt-print";
import type { KitchenPrintJobPayload } from "@/lib/kitchen-print";

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

  const [{ data: printer }, bufferResult] = await Promise.all([
    supabase
      .from("kitchen_printers")
      .select("name, connection_type, address")
      .eq("id", printerId)
      .eq("business_id", businessId)
      .maybeSingle(),
    buildReceiptBuffer(supabase, businessId, transactionId),
  ]);

  if (!printer) {
    return { success: false, error: "Printer tidak ditemukan." };
  }
  if (!printer.address) {
    return { success: false, error: "Printer ini belum diatur alamat/perangkatnya." };
  }
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
