"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addPurchase } from "./actions";

// Jembatan penerimaan Surat Jalan lintas-bisnis (lihat migrasi
// 20260901120000_delivery_note_cross_business_receive.sql untuk RPC-nya).
// Baca = get_manual_delivery_note_by_code (siapa saja yang login & tahu
// kodenya boleh baca, sama seperti pegang kertas Surat Jalan fisik).
// Tulis = SELALU lewat addPurchase yang sudah ada (satu-satunya jalur yang
// tervalidasi & posting jurnal dengan benar) -- fungsi di sini cuma
// menyiapkan input untuk addPurchase per barang, tidak menduplikasi logikanya.

export type DeliveryNoteItem = { name: string; unit: string | null; qty: number };

export type FetchDeliveryNoteResult = {
  error: string | null;
  data: {
    dnNumber: string;
    fromBusinessName: string;
    destination: string;
    createdAt: string;
    alreadyReceived: boolean;
    receivedByBusinessName: string | null;
    items: DeliveryNoteItem[];
  } | null;
};

export async function fetchDeliveryNoteByCode(code: string): Promise<FetchDeliveryNoteResult> {
  const trimmed = code.trim();
  if (!trimmed) return { error: "Kode wajib diisi.", data: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_manual_delivery_note_by_code", { p_code: trimmed });

  if (error) return { error: error.message, data: null };
  if (!data) return { error: "Kode Surat Jalan tidak ditemukan.", data: null };

  const d = data as {
    dn_number: string;
    from_business_name: string;
    destination: string;
    created_at: string;
    already_received: boolean;
    received_by_business_name: string | null;
    items: DeliveryNoteItem[];
  };

  return {
    error: null,
    data: {
      dnNumber: d.dn_number,
      fromBusinessName: d.from_business_name,
      destination: d.destination,
      createdAt: d.created_at,
      alreadyReceived: d.already_received,
      receivedByBusinessName: d.received_by_business_name,
      items: d.items ?? [],
    },
  };
}

export type ReceiveItemInput = {
  itemName: string;
  unit: string;
  qty: number;
  // null = bahan baku belum ada, buat baru pakai itemName sebagai nama
  ingredientId: string | null;
  unitPrice: number;
};

export type ReceiveDeliveryNoteState = { error: string | null; success: boolean };

export async function receiveDeliveryNote(
  businessId: string,
  code: string,
  supplierName: string,
  items: ReceiveItemInput[],
): Promise<ReceiveDeliveryNoteState> {
  const trimmedCode = code.trim();
  if (!trimmedCode) return { error: "Kode wajib diisi.", success: false };
  if (items.length === 0) return { error: "Tidak ada barang untuk diterima.", success: false };
  for (const it of items) {
    if (!it.unitPrice || it.unitPrice <= 0) {
      return { error: `Harga satuan "${it.itemName}" harus diisi lebih dari 0.`, success: false };
    }
  }

  const supabase = await createClient();

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("business_id", businessId)
    .eq("is_default_purchase", true)
    .limit(1)
    .maybeSingle();

  if (!location) {
    return { error: "Lokasi produksi/pembelian belum diatur untuk toko ini.", success: false };
  }

  // Klaim dulu -- atomik, cuma berhasil sekali. Kalau sudah pernah diklaim
  // (toko ini sendiri submit ganda, atau toko lain lebih dulu), tolak di
  // sini SEBELUM ada satu pun baris Pembelian dibuat.
  const { data: claimedId, error: claimError } = await supabase.rpc("claim_manual_delivery_note_by_code", {
    p_code: trimmedCode,
    p_receiving_business_id: businessId,
  });
  if (claimError) return { error: claimError.message, success: false };
  if (!claimedId) return { error: "Surat Jalan ini sudah pernah diterima sebelumnya.", success: false };

  let supplierId: string | null = null;
  const trimmedSupplierName = supplierName.trim();
  if (trimmedSupplierName) {
    const { data: existingSupplier } = await supabase
      .from("suppliers")
      .select("id")
      .eq("business_id", businessId)
      .eq("name", trimmedSupplierName)
      .maybeSingle();

    if (existingSupplier) {
      supplierId = existingSupplier.id;
    } else {
      const { data: createdSupplier } = await supabase
        .from("suppliers")
        .insert({ business_id: businessId, name: trimmedSupplierName })
        .select("id")
        .single();
      supplierId = createdSupplier?.id ?? null;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const errors: string[] = [];

  for (const item of items) {
    let ingredientId = item.ingredientId;

    if (!ingredientId) {
      const { data: newIngredient, error: ingredientError } = await supabase
        .from("ingredients")
        .insert({
          business_id: businessId,
          name: item.itemName,
          unit: item.unit || "pcs",
          unit_cost: item.unitPrice,
          stock: 0,
        })
        .select("id")
        .single();

      if (ingredientError || !newIngredient) {
        errors.push(`Gagal buat bahan baru "${item.itemName}": ${ingredientError?.message ?? "unknown"}`);
        continue;
      }
      ingredientId = newIngredient.id;
    }

    const formData = new FormData();
    if (supplierId) formData.set("supplierId", supplierId);
    formData.set("date", today);
    formData.set("category", "Bahan Baku");
    formData.set("note", `Terima dari Surat Jalan ${trimmedCode}`);
    formData.set("amount", String(Math.round(item.qty * item.unitPrice)));
    formData.set("paidAmount", "0");
    formData.set("qty", String(item.qty));
    formData.set("ingredientId", ingredientId);
    formData.set("locationId", location.id);

    const result = await addPurchase(businessId, { error: null, resetToken: 0 }, formData);
    if (result.error) errors.push(`"${item.itemName}": ${result.error}`);
  }

  if (errors.length > 0) {
    return { error: errors.join(" | "), success: errors.length < items.length };
  }

  revalidatePath(`/business/${businessId}/purchases`);
  return { error: null, success: true };
}
