"use server";

import { createClient } from "@/lib/supabase/server";
import type { PreviewDoc } from "./doc-preview-modal";

// Dipakai klik item Riwayat di versi umum (business-scoped) Dokumen Manual
// -- fetch on-demand lalu tampil di modal preview inline, GANTI navigasi ke
// halaman /surat-jalan/[docId] dst yang sempat 404 terus di production
// (lihat catatan di doc-preview-modal.tsx).

export async function getManualDeliveryNoteDetail(
  businessId: string,
  docId: string,
): Promise<PreviewDoc | null> {
  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) return null;

  const { data: doc } = await supabase
    .from("manual_delivery_notes")
    .select("dn_number, destination, note, created_at, receive_code")
    .eq("id", docId)
    .eq("business_id", businessId)
    .is("location_id", null)
    .single();
  if (!doc) return null;

  const { data: items } = await supabase
    .from("manual_delivery_note_items")
    .select("item_name, unit, qty")
    .eq("manual_delivery_note_id", docId)
    .order("sort_order", { ascending: true });

  return {
    type: "surat-jalan",
    docNumber: doc.dn_number,
    createdAt: doc.created_at,
    businessName: business.name,
    context: doc.destination,
    note: doc.note ?? "",
    items: (items ?? []).map((i) => ({ itemName: i.item_name, unit: i.unit ?? "", qty: Number(i.qty) })),
    receiveCode: doc.receive_code,
  };
}

export async function getManualPurchaseRequestDetail(
  businessId: string,
  docId: string,
): Promise<PreviewDoc | null> {
  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) return null;

  const { data: doc } = await supabase
    .from("manual_purchase_requests")
    .select("pr_number, note, created_at")
    .eq("id", docId)
    .eq("business_id", businessId)
    .is("location_id", null)
    .single();
  if (!doc) return null;

  const { data: items } = await supabase
    .from("manual_purchase_request_items")
    .select("item_name, unit, qty")
    .eq("manual_purchase_request_id", docId)
    .order("sort_order", { ascending: true });

  return {
    type: "permintaan-barang",
    docNumber: doc.pr_number,
    createdAt: doc.created_at,
    businessName: business.name,
    context: "",
    note: doc.note ?? "",
    items: (items ?? []).map((i) => ({ itemName: i.item_name, unit: i.unit ?? "", qty: Number(i.qty) })),
  };
}

export async function getManualStockOpnameDetail(
  businessId: string,
  docId: string,
): Promise<PreviewDoc | null> {
  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  if (!business) return null;

  const { data: doc } = await supabase
    .from("manual_stock_opnames")
    .select("opname_number, note, created_at")
    .eq("id", docId)
    .eq("business_id", businessId)
    .is("location_id", null)
    .single();
  if (!doc) return null;

  const { data: items } = await supabase
    .from("manual_stock_opname_items")
    .select("item_name, unit, qty")
    .eq("manual_stock_opname_id", docId)
    .order("sort_order", { ascending: true });

  return {
    type: "stock-opname",
    docNumber: doc.opname_number,
    createdAt: doc.created_at,
    businessName: business.name,
    context: "",
    note: doc.note ?? "",
    items: (items ?? []).map((i) => ({ itemName: i.item_name, unit: i.unit ?? "", qty: Number(i.qty) })),
  };
}
