"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";
import { logActivity } from "@/lib/activity-log";
import { syncFinishedProductsToCatalog } from "@/lib/cost-control/sync-finished-products-catalog";

export type ImportSalesRecapState = {
  error: string | null;
  result: { invoiceNumber: string; itemCount: number; skipped: string[] } | null;
};

// Beda dari importTransactions (yang butuh Referensi+Tanggal per baris buat
// data transaksi harian) -- ini khusus rekap PERIODE (mis. laporan bulanan
// dari POS lain seperti ESB "Sales Menu Recapitulation Report") yang cuma
// punya total qty per menu, tanpa breakdown tanggal/transaksi. Semua baris
// digabung jadi SATU transaksi manual (banyak item) bertanggal p_date,
// ditandai lewat catatan supaya tidak ketuker sama transaksi harian asli.
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
    return { error: "Pilih file CSV dulu.", result: null };
  }

  const dateStr = (formData.get("date") as string) || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: "Tanggal wajib diisi.", result: null };
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

  const text = await file.text();
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) {
    return { error: "File CSV kosong atau cuma berisi header.", result: null };
  }
  const dataRows = rows.slice(1);

  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .eq("business_id", businessId)
    .is("deleted_at", null);
  const productIdByName = new Map((products ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]));

  const items: { product_id: string; qty: number }[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const line = i + 2;
    const menuName = (row[0] ?? "").trim();
    const qty = Number((row[1] ?? "").trim());

    if (!menuName) {
      skipped.push(`Baris ${line}: nama menu kosong`);
      continue;
    }
    if (!row[1] || Number.isNaN(qty) || qty <= 0) {
      // Baris qty 0 (item ada di laporan tapi tidak laku di periode itu)
      // dilewati diam-diam -- bukan error, wajar banyak menu begitu di
      // rekap ESB.
      continue;
    }

    const productId = productIdByName.get(menuName.toLowerCase());
    if (!productId) {
      skipped.push(`Baris ${line}: menu "${menuName}" tidak ditemukan di Produk Jadi (HPP)`);
      continue;
    }

    items.push({ product_id: productId, qty });
  }

  if (items.length === 0) {
    return {
      error:
        skipped.length > 0
          ? `Tidak ada baris yang bisa diimpor. ${skipped[0]}`
          : "Tidak ada baris dengan qty > 0 untuk diimpor.",
      result: null,
    };
  }

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
    return { error: error.message, result: null };
  }

  const invoiceNumber = data?.[0]?.invoice_number ?? "-";

  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "sukses",
    `Impor rekap penjualan: ${invoiceNumber}`,
    `${items.length} menu${skipped.length > 0 ? `, ${skipped.length} baris dilewati` : ""} — ${catatan}`,
  );

  revalidatePath(`/business/${businessId}/transactions`);
  return { error: null, result: { invoiceNumber, itemCount: items.length, skipped } };
}
