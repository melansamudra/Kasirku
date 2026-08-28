"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import { logActivity } from "@/lib/activity-log";
import { syncFinishedProductsToCatalog } from "@/lib/cost-control/sync-finished-products-catalog";

// Sama pola dengan parseFileToRows di products/actions.ts -- terima .xlsx
// (file Excel beneran, tidak kena masalah "list separator" regional Windows
// yang suka mecah CSV berantakan) ATAU .csv biasa, dua-duanya jadi
// string[][] yang sama.
async function parseFileToRows(file: File): Promise<string[][] | { error: string }> {
  const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

  if (isXlsx) {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { error: "File Excel tidak memiliki sheet." };

    const rows: string[][] = [];
    sheet.eachRow((row) => {
      rows.push(
        (row.values as (ExcelJS.CellValue | null)[])
          .slice(1) // ExcelJS row.values 1-indexed, index 0 selalu null
          .map((v) => (v == null ? "" : String(v instanceof Object && "text" in v ? (v as { text: string }).text : v))),
      );
    });
    return rows;
  }

  const text = await file.text();
  return parseCsv(text);
}

export type ImportSalesRecapState = {
  error: string | null;
  result: {
    invoiceNumbers: string[];
    transactionCount: number;
    itemCount: number;
    createdProducts: string[];
    skipped: string[];
  } | null;
};

// Beda dari importTransactions (yang butuh Referensi+Tanggal per baris buat
// data transaksi harian) -- ini khusus rekap yang biasanya tidak punya
// nomor referensi (mis. laporan bulanan dari POS lain seperti ESB "Sales
// Menu Recapitulation Report"), cuma total qty per menu per Tanggal.
// Baris dengan Tanggal yang sama digabung jadi SATU transaksi (banyak
// item); Tanggal boleh dikosongkan per baris, jatuh ke "Tanggal Default"
// dari form -- berguna kalau sumber datanya cuma total sebulan tanpa
// breakdown harian sama sekali. Semua transaksi ditandai lewat catatan
// supaya tidak ketuker sama transaksi harian asli.
//
// Harga & cost tetap ikut harga PRODUK JADI SAAT INI (create_manual_transaction
// tidak bisa dikasih harga custom per baris, dan RPC ini sengaja tidak
// disentuh -- lihat sync-finished-products-catalog.ts) -- BUKAN harga
// historis di laporan sumbernya. Kalau harga sudah berubah sejak periode
// itu, total Rupiah hasil impor bisa beda dari laporan aslinya walau qty-nya
// sama persis.
export async function importSalesRecap(
  businessId: string,
  _prevState: ImportSalesRecapState,
  formData: FormData,
): Promise<ImportSalesRecapState> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Pilih file dulu.", result: null };
  }

  const defaultDateStr = (formData.get("date") as string) || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(defaultDateStr)) {
    return { error: "Tanggal Default wajib diisi.", result: null };
  }

  const paymentMethod = (formData.get("paymentMethod") as string) || "";
  if (!paymentMethod.trim()) {
    return { error: "Pilih metode bayar dulu.", result: null };
  }

  const noteInput = (formData.get("note") as string)?.trim();

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("cost_control_enabled")
    .eq("id", businessId)
    .single();
  if (!business?.cost_control_enabled) {
    return { error: "Impor rekap penjualan cuma tersedia untuk bisnis cost-control.", result: null };
  }

  await syncFinishedProductsToCatalog(supabase, businessId);

  const parsed = await parseFileToRows(file);
  if ("error" in parsed) return { error: parsed.error, result: null };

  const rows = parsed.filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) {
    return { error: "File kosong atau cuma berisi header.", result: null };
  }
  const dataRows = rows.slice(1);

  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .eq("business_id", businessId)
    .is("deleted_at", null);
  const productIdByName = new Map((products ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]));

  type ParsedRow = { line: number; date: string; menuName: string; kategori: string; harga: number; qty: number };
  const parsedRows: ParsedRow[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const line = i + 2;
    const dateCell = (row[0] ?? "").trim();
    const menuName = (row[1] ?? "").trim();
    const kategori = (row[2] ?? "").trim();
    const harga = Number((row[3] ?? "").trim());
    const qty = Number((row[4] ?? "").trim());

    if (dateCell && !/^\d{4}-\d{2}-\d{2}$/.test(dateCell)) {
      skipped.push(`Baris ${line}: Tanggal "${dateCell}" harus format YYYY-MM-DD (atau dikosongkan)`);
      continue;
    }
    if (!menuName) {
      skipped.push(`Baris ${line}: nama menu kosong`);
      continue;
    }
    if (!row[4] || Number.isNaN(qty) || qty <= 0) {
      // Baris qty 0 (item ada di laporan tapi tidak laku di periode itu)
      // dilewati diam-diam -- bukan error, wajar banyak menu begitu di
      // rekap ESB.
      continue;
    }

    parsedRows.push({
      line,
      date: dateCell || defaultDateStr,
      menuName,
      kategori,
      harga: Number.isNaN(harga) ? 0 : harga,
      qty,
    });
  }

  // Menu yang belum ada di Produk Jadi (HPP) -- kalau baris itu bawa
  // Kategori & Harga, buat Produk Jadi baru sekalian (arahan user: "benerin
  // produk dan kategori sekaligus harganya") alih-alih cuma dilewati kayak
  // sebelumnya. Tanpa resep (finished_product_recipes) -- HPP-nya nol
  // sampai resepnya diisi manual nanti, sama seperti nambah Produk Jadi
  // baru lewat form biasa.
  const missingByName = new Map<string, ParsedRow>();
  for (const r of parsedRows) {
    const key = r.menuName.toLowerCase();
    if (!productIdByName.has(key) && !missingByName.has(key)) {
      missingByName.set(key, r);
    }
  }

  const createdProducts: string[] = [];
  const toInsert: { business_id: string; name: string; category: string | null; selling_price: number }[] = [];
  for (const r of missingByName.values()) {
    if (!r.kategori || !(r.harga > 0)) {
      skipped.push(
        `Baris ${r.line}: menu "${r.menuName}" belum ada di Produk Jadi (HPP), dan Kategori/Harga di baris ini kosong -- tidak bisa dibuat otomatis.`,
      );
      continue;
    }
    toInsert.push({ business_id: businessId, name: r.menuName, category: r.kategori, selling_price: r.harga });
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from("finished_products").insert(toInsert);
    if (insertErr) {
      return { error: `Gagal membuat Produk Jadi baru: ${insertErr.message}`, result: null };
    }
    createdProducts.push(...toInsert.map((p) => p.name));
    // Sync ulang supaya produk yang baru dibuat ikut ter-mirror ke
    // `products` sebelum dicocokkan lagi di bawah.
    await syncFinishedProductsToCatalog(supabase, businessId);
    const { data: refreshedProducts } = await supabase
      .from("products")
      .select("id, name")
      .eq("business_id", businessId)
      .is("deleted_at", null);
    productIdByName.clear();
    for (const p of refreshedProducts ?? []) {
      productIdByName.set(p.name.trim().toLowerCase(), p.id);
    }
  }

  // Grup per Tanggal -- 1 transaksi per tanggal berbeda (banyak item di
  // tanggal yang sama, digabung sama seperti sebelumnya).
  const groupsByDate = new Map<string, { product_id: string; qty: number }[]>();
  for (const r of parsedRows) {
    const productId = productIdByName.get(r.menuName.toLowerCase());
    if (!productId) {
      if (!skipped.some((s) => s.includes(`"${r.menuName}"`))) {
        skipped.push(`Baris ${r.line}: menu "${r.menuName}" tidak ditemukan di Produk Jadi (HPP)`);
      }
      continue;
    }
    const list = groupsByDate.get(r.date) ?? [];
    list.push({ product_id: productId, qty: r.qty });
    groupsByDate.set(r.date, list);
  }

  if (groupsByDate.size === 0) {
    return {
      error:
        skipped.length > 0
          ? `Tidak ada baris yang bisa diimpor. ${skipped[0]}`
          : "Tidak ada baris dengan qty > 0 untuk diimpor.",
      result: null,
    };
  }

  const invoiceNumbers: string[] = [];
  let itemCount = 0;

  for (const [dateStr, items] of [...groupsByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const catatan = noteInput || `Rekap Penjualan — ${dateStr}`;

    const { data, error } = await supabase.rpc("create_manual_transaction", {
      p_business_id: businessId,
      p_date: new Date(`${dateStr}T12:00:00`).toISOString(),
      p_items: items,
      p_payment_method: paymentMethod,
      p_received: null,
      p_customer_id: null,
      p_catatan: catatan,
    });

    if (error) {
      return {
        error: `Gagal buat transaksi tanggal ${dateStr}: ${error.message}${invoiceNumbers.length > 0 ? ` (${invoiceNumbers.length} transaksi sebelumnya sudah kebuat: ${invoiceNumbers.join(", ")})` : ""}`,
        result: null,
      };
    }

    invoiceNumbers.push(data?.[0]?.invoice_number ?? "-");
    itemCount += items.length;
  }

  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "sukses",
    `Impor rekap penjualan: ${invoiceNumbers.length} transaksi`,
    `${itemCount} baris menu${createdProducts.length > 0 ? `, ${createdProducts.length} Produk Jadi baru dibuat` : ""}${skipped.length > 0 ? `, ${skipped.length} baris dilewati` : ""}`,
  );

  if (createdProducts.length > 0) {
    revalidatePath(`/business/${businessId}/finished-products`);
    revalidatePath(`/business/${businessId}/transactions/new`);
  }
  revalidatePath(`/business/${businessId}/transactions`);
  return {
    error: null,
    result: { invoiceNumbers, transactionCount: invoiceNumbers.length, itemCount, createdProducts, skipped },
  };
}
