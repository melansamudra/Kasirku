"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { syncFinishedProductsToCatalog } from "@/lib/cost-control/sync-finished-products-catalog";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";

// Kolom yang dibaca dari "Sales Recapitulation Detail Report" ESB -- laporan
// SATU BARIS PER MENU per transaksi (beda dari import_sales_recap yang cuma
// terima 5 kolom ringkas). Header ESB tidak selalu di baris 1 (ada blok
// judul/periode/cabang di atasnya) dan urutan kolom bisa beda antar versi
// export, jadi dicari lewat NAMA header, bukan posisi tetap.
const REQUIRED_COLUMNS = [
  "Sales Number",
  "Sales Date In",
  "Payment Method",
  "Menu Category",
  "Menu Category Detail",
  "Menu",
  "Qty",
  "Price",
  "Subtotal",
  "Discount",
  "Service Charge",
  "Tax",
] as const;

type ColMap = Record<(typeof REQUIRED_COLUMNS)[number] | "Bill Number", number>;

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
  }
  if (typeof v === "object" && "result" in v) {
    return String((v as { result: unknown }).result ?? "");
  }
  return String(v).trim();
}

function cellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v == null) return 0;
  if (typeof v === "object" && "result" in v) {
    const n = Number((v as { result: unknown }).result);
    return Number.isNaN(n) ? 0 : n;
  }
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function cellDate(cell: ExcelJS.Cell): Date | null {
  const v = cell.value;
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function findHeaderAndColumns(sheet: ExcelJS.Worksheet): ColMap | null {
  let headerRow: ExcelJS.Row | null = null;
  const maxScan = Math.min(sheet.rowCount, 30);
  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r);
    if (cellText(row.getCell(1)).toLowerCase() === "sales number") {
      headerRow = row;
      break;
    }
  }
  if (!headerRow) return null;

  const map: Partial<ColMap> = {};
  const maxCol = Math.min(sheet.columnCount, 60);
  for (let c = 1; c <= maxCol; c++) {
    const name = cellText(headerRow.getCell(c));
    if (!name) continue;
    if (name === "Bill Number") map["Bill Number"] = c;
    for (const req of REQUIRED_COLUMNS) {
      if (name === req) map[req] = c;
    }
  }

  for (const req of REQUIRED_COLUMNS) {
    if (!map[req]) return null;
  }
  return { ...map, "Bill Number": map["Bill Number"] ?? 0 } as ColMap;
}

type ParsedLine = {
  salesNumber: string;
  billNumber: string;
  date: Date;
  paymentMethod: string;
  menuCategory: string;
  menuCategoryDetail: string;
  menu: string;
  qty: number;
  price: number;
  subtotal: number;
  discount: number;
  service: number;
  tax: number;
};

export type ImportEsbState = {
  error: string | null;
  result: {
    invoiceNumbers: string[];
    transactionCount: number;
    itemCount: number;
    createdProducts: string[];
    skippedCount: number;
    warnings: string[];
  } | null;
};

// Beda dari importSalesRecap (rekap-actions.ts): file ini adalah laporan
// DETAIL, satu baris per menu per transaksi, sudah punya nomor transaksi
// (Sales Number), jam transaksi presisi, dan tax/service yang SUDAH
// dihitung ESB per baris -- semuanya dipakai langsung (bukan dihitung
// ulang dari businesses.tax_rate/service_rate seperti importer lain).
// Baris dengan Sales Number sama digabung jadi SATU transaksi.
export async function importEsbSalesDetail(
  businessId: string,
  _prevState: ImportEsbState,
  formData: FormData,
): Promise<ImportEsbState> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Pilih file dulu.", result: null };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
    return { error: "File harus format Excel (.xlsx) hasil export ESB.", result: null };
  }

  const noteInput = (formData.get("note") as string)?.trim();

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !hasStockLocationAccess(business)) {
    return { error: "Impor rekap ESB belum tersedia untuk bisnis ini.", result: null };
  }
  const costControlEnabled = business.cost_control_enabled ?? false;

  if (costControlEnabled) {
    await syncFinishedProductsToCatalog(supabase, businessId);
  }

  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { error: "File Excel tidak bisa dibaca. Pastikan ini file .xlsx asli dari ESB.", result: null };
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { error: "File Excel tidak memiliki sheet.", result: null };

  const cols = findHeaderAndColumns(sheet);
  if (!cols) {
    return {
      error:
        "Format kolom tidak dikenali. File harus punya kolom: Sales Number, Sales Date In, Payment Method, Menu Category, Menu Category Detail, Menu, Qty, Price, Subtotal, Discount, Service Charge, Tax (persis seperti export \"Sales Recapitulation Detail Report\" dari ESB).",
      result: null,
    };
  }

  const lines: ParsedLine[] = [];
  const warnings: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    const salesNumber = cellText(row.getCell(cols["Sales Number"]));
    if (!salesNumber || salesNumber.toLowerCase() === "sales number") return;

    const qty = cellNumber(row.getCell(cols["Qty"]));
    if (!qty || qty <= 0) return; // menu ada di laporan tapi qty 0/kosong, wajar dilewati diam-diam

    const menu = cellText(row.getCell(cols["Menu"]));
    if (!menu) {
      warnings.push(`Baris ${rowNumber}: nama menu kosong, dilewati.`);
      return;
    }

    const date = cellDate(row.getCell(cols["Sales Date In"]));
    if (!date) {
      warnings.push(`Baris ${rowNumber}: "Sales Date In" tidak valid, dilewati.`);
      return;
    }

    lines.push({
      salesNumber,
      billNumber: cols["Bill Number"] ? cellText(row.getCell(cols["Bill Number"])) : salesNumber,
      date,
      paymentMethod: cellText(row.getCell(cols["Payment Method"])) || "Lainnya",
      menuCategory: cellText(row.getCell(cols["Menu Category"])),
      menuCategoryDetail: cellText(row.getCell(cols["Menu Category Detail"])),
      menu,
      qty,
      price: cellNumber(row.getCell(cols["Price"])),
      subtotal: cellNumber(row.getCell(cols["Subtotal"])),
      discount: cellNumber(row.getCell(cols["Discount"])),
      service: cellNumber(row.getCell(cols["Service Charge"])),
      tax: cellNumber(row.getCell(cols["Tax"])),
    });
  });

  if (lines.length === 0) {
    return {
      error: warnings.length > 0 ? `Tidak ada baris yang bisa diimpor. ${warnings[0]}` : "File kosong atau tidak ada baris dengan Qty > 0.",
      result: null,
    };
  }

  // Cocokkan nama menu ke katalog produk (case-insensitive). Menu yang
  // belum ada dibuat otomatis pakai Menu Category Detail (kategori paling
  // spesifik di ESB) & Price dari baris pertama menu itu muncul -- sama
  // seperti pola importSalesRecap, HPP-nya nol sampai resepnya diisi manual.
  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .eq("business_id", businessId)
    .is("deleted_at", null);
  const productIdByName = new Map((products ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]));

  const missingByName = new Map<string, { name: string; category: string; price: number }>();
  for (const l of lines) {
    const key = l.menu.toLowerCase();
    if (!productIdByName.has(key) && !missingByName.has(key)) {
      missingByName.set(key, {
        name: l.menu,
        category: l.menuCategoryDetail || l.menuCategory || "Lainnya",
        price: l.price,
      });
    }
  }

  const createdProducts: string[] = [];
  const toCreate = [...missingByName.values()];
  const catalogLabel = costControlEnabled ? "Produk Jadi (HPP)" : "Kelola Produk";

  if (toCreate.length > 0) {
    if (costControlEnabled) {
      const { error: insertErr } = await supabase.from("finished_products").insert(
        toCreate.map((p) => ({ business_id: businessId, name: p.name, category: p.category, selling_price: p.price })),
      );
      if (insertErr) {
        return { error: `Gagal membuat Produk Jadi baru: ${insertErr.message}`, result: null };
      }
      await syncFinishedProductsToCatalog(supabase, businessId);
      const { data: refreshed } = await supabase
        .from("products")
        .select("id, name")
        .eq("business_id", businessId)
        .is("deleted_at", null);
      productIdByName.clear();
      for (const p of refreshed ?? []) productIdByName.set(p.name.trim().toLowerCase(), p.id);
    } else {
      const { data: created, error: insertErr } = await supabase
        .from("products")
        .insert(toCreate.map((p) => ({ business_id: businessId, name: p.name, category: p.category, price: p.price, cost: 0 })))
        .select("id, name");
      if (insertErr) {
        return { error: `Gagal membuat produk baru: ${insertErr.message}`, result: null };
      }
      for (const p of created ?? []) productIdByName.set(p.name.trim().toLowerCase(), p.id);
    }
    createdProducts.push(...toCreate.map((p) => p.name));
  }

  // Grup per Sales Number -- 1 baris ESB = 1 item, banyak baris dengan
  // Sales Number sama = 1 transaksi (bill) utuh.
  type TxDraft = {
    external_ref: string;
    date: Date;
    paymentMethodCounts: Map<string, number>;
    catatan: string;
    items: { product_id: string; qty: number; price: number }[];
    subtotal: number;
    item_disc: number;
    service: number;
    tax: number;
    unmatched: string[];
  };
  const groups = new Map<string, TxDraft>();

  for (const l of lines) {
    let g = groups.get(l.salesNumber);
    if (!g) {
      g = {
        external_ref: l.salesNumber,
        date: l.date,
        paymentMethodCounts: new Map(),
        catatan: noteInput || `Impor ESB — ${l.billNumber || l.salesNumber}`,
        items: [],
        subtotal: 0,
        item_disc: 0,
        service: 0,
        tax: 0,
        unmatched: [],
      };
      groups.set(l.salesNumber, g);
    }
    if (l.date < g.date) g.date = l.date;
    g.paymentMethodCounts.set(l.paymentMethod, (g.paymentMethodCounts.get(l.paymentMethod) ?? 0) + 1);
    g.subtotal += l.subtotal;
    g.item_disc += l.discount;
    g.service += l.service;
    g.tax += l.tax;

    const productId = productIdByName.get(l.menu.toLowerCase());
    if (!productId) {
      if (!g.unmatched.includes(l.menu)) g.unmatched.push(l.menu);
      continue;
    }
    g.items.push({ product_id: productId, qty: l.qty, price: l.price });
  }

  type EsbTxPayload = {
    external_ref: string;
    date: string;
    payment_method: string;
    catatan: string;
    items: { product_id: string; qty: number; price: number }[];
    subtotal: number;
    item_disc: number;
    service: number;
    tax: number;
  };
  const unmatchedMenus = new Set<string>();
  const payload: EsbTxPayload[] = [];
  for (const g of groups.values()) {
    if (g.unmatched.length > 0) {
      for (const m of g.unmatched) unmatchedMenus.add(m);
    }
    if (g.items.length === 0) continue; // seluruh menu di transaksi ini tidak cocok, lewati transaksinya

    let bestMethod = "Lainnya";
    let bestCount = 0;
    for (const [method, count] of g.paymentMethodCounts) {
      if (count > bestCount) {
        bestMethod = method;
        bestCount = count;
      }
    }

    payload.push({
      external_ref: g.external_ref,
      date: g.date.toISOString(),
      payment_method: bestMethod,
      catatan: g.catatan,
      items: g.items,
      subtotal: g.subtotal,
      item_disc: g.item_disc,
      service: g.service,
      tax: g.tax,
    });
  }

  if (unmatchedMenus.size > 0) {
    warnings.push(`${unmatchedMenus.size} menu tidak ditemukan di ${catalogLabel} walau sudah dicoba dibuat otomatis: ${[...unmatchedMenus].join(", ")}`);
  }

  if (payload.length === 0) {
    return {
      error: warnings.length > 0 ? `Tidak ada transaksi yang bisa diimpor. ${warnings[0]}` : "Tidak ada transaksi dengan menu yang cocok untuk diimpor.",
      result: null,
    };
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc("import_esb_sales_bulk", {
    p_business_id: businessId,
    p_transactions: payload,
  });

  if (rpcError) {
    return { error: `Gagal impor: ${rpcError.message}`, result: null };
  }

  const row = rpcResult?.[0] as { created: number; skipped: number; skipped_refs: string[] } | undefined;
  const created = row?.created ?? 0;
  const skipped = row?.skipped ?? 0;
  if (row?.skipped_refs && row.skipped_refs.length > 0) {
    warnings.push(`${row.skipped_refs.length} transaksi dilewati (kemungkinan sudah pernah diimpor sebelumnya): ${row.skipped_refs.slice(0, 10).join(", ")}${row.skipped_refs.length > 10 ? ", ..." : ""}`);
  }

  const itemCount = payload.reduce((sum, p) => sum + p.items.length, 0);

  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "sukses",
    `Impor rekap ESB: ${created} transaksi`,
    `${itemCount} baris menu${createdProducts.length > 0 ? `, ${createdProducts.length} produk baru dibuat` : ""}${skipped > 0 ? `, ${skipped} transaksi dilewati (duplikat)` : ""}`,
  );

  if (createdProducts.length > 0) {
    revalidatePath(costControlEnabled ? `/business/${businessId}/finished-products` : `/business/${businessId}/products`);
    revalidatePath(`/business/${businessId}/transactions/new`);
  }
  revalidatePath(`/business/${businessId}/transactions`);

  return {
    error: null,
    result: {
      invoiceNumbers: [],
      transactionCount: created,
      itemCount,
      createdProducts,
      skippedCount: skipped,
      warnings,
    },
  };
}
