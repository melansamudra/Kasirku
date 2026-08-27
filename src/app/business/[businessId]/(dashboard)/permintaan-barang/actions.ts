"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ActionState = { error: string | null };

// Gerbang alur memo Cost Control (001/MEMO-CC/VIII/2026): PR harus lolos cek
// budget dulu sebelum boleh dialokasikan/diteruskan ke supplier -- TAPI:
// (1) cuma berlaku untuk bisnis cost-control, (2) cuma AKTIF kalau saklar
// businesses.procurement_budget_gate_enabled ON. Default OFF -- "saat ini
// budget belum dilakukan, klo sudah difungsikan baru dipakai" (arahan user
// 2026-08-27). Sekarang dicek PER ITEM (bukan per PR) -- "per item barang,
// PR terkoreksi".
async function requiresItemBudgetApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  itemId: string,
): Promise<string | null> {
  const { data: business } = await supabase
    .from("businesses")
    .select("cost_control_enabled, procurement_budget_gate_enabled")
    .eq("id", businessId)
    .single();
  if (!business?.cost_control_enabled || !business?.procurement_budget_gate_enabled) return null;

  const { data: item } = await supabase
    .from("purchase_request_items")
    .select("item_name, budget_status")
    .eq("id", itemId)
    .eq("business_id", businessId)
    .single();

  if (item && item.budget_status !== "approved_in_budget") {
    return `"${item.item_name}" belum disetujui Cost Control (APPROVED IN BUDGET). Setujui dulu sebelum alokasi ke supplier.`;
  }
  return null;
}

// Verifikasi & Otorisasi Anggaran (langkah 2 di memo) -- Cost Control
// menyetujui/menolak PER ITEM (bukan seluruh PR sekaligus) terhadap sisa
// kuota RAB bulan berjalan. `approverName` dipilih dari daftar karyawan
// (belum ada login staf terpisah per peran).
export async function approveItemBudget(
  businessId: string,
  itemId: string,
  decision: "approved_in_budget" | "rejected",
  approverName: string,
  note: string,
): Promise<ActionState> {
  if (!approverName.trim()) {
    return { error: "Pilih nama yang menyetujui/menolak." };
  }
  if (decision === "rejected" && !note.trim()) {
    return { error: "Alasan penolakan wajib diisi." };
  }

  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("purchase_request_items")
    .update({
      budget_status: decision,
      budget_approved_by: approverName.trim(),
      budget_approved_at: new Date().toISOString(),
      budget_note: note.trim() || null,
    })
    .eq("id", itemId)
    .eq("business_id", businessId)
    .select("item_name, purchase_request_id")
    .single();

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    decision === "approved_in_budget" ? "sukses" : "warning",
    decision === "approved_in_budget" ? `Item disetujui — APPROVED IN BUDGET: ${item.item_name}` : `Item ditolak (budget): ${item.item_name}`,
    note.trim() || undefined,
  );

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  revalidatePath(`/business/${businessId}/permintaan-barang/${item.purchase_request_id}`);
  return { error: null };
}

// Keputusan Purchasing per item (langkah baru, arahan user 2026-08-27):
// ambil dari stok Gudang Utama (tidak beli baru) atau perlu order ke
// supplier. `source='supplier'` cuma menandai -- alur alokasi->forward->PO
// yang sudah ada jalan seperti biasa. `source='stock'` sekaligus catat
// baris fulfillment (belum memindahkan stok -- baru pindah saat lokasi
// peminta konfirmasi terima lewat receiveStockFulfillment).
export async function markItemFulfillment(
  businessId: string,
  itemId: string,
  source: "stock" | "supplier",
  markedBy?: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("purchase_request_items")
    .select("id, item_name, qty_ordered, approved_qty")
    .eq("id", itemId)
    .eq("business_id", businessId)
    .single();
  if (!item) return { error: "Barang tidak ditemukan." };

  // Kalau stoknya sudah beneran diterima/dipindah (receiveStockFulfillment
  // sudah jalan), tidak boleh ditandai ulang -- keputusan fulfillment sudah
  // final di titik itu.
  const { count: receivedCount } = await supabase
    .from("purchase_request_item_stock_fulfillments")
    .select("id", { count: "exact", head: true })
    .eq("purchase_request_item_id", itemId)
    .eq("business_id", businessId)
    .not("received_at", "is", null);
  if (receivedCount && receivedCount > 0) {
    return { error: "Barang ini sudah diterima dari Gudang Utama, tidak bisa ditandai ulang." };
  }

  // Bersihkan baris fulfillment yang BELUM diterima dari penandaan
  // sebelumnya -- mencegah klik dobel/ganti pilihan (stock->supplier atau
  // sebaliknya) menumpuk beberapa baris fulfillment untuk barang yang sama
  // (kalau tidak, qty yang akhirnya dipindah bisa dobel/tiga kali lipat).
  await supabase
    .from("purchase_request_item_stock_fulfillments")
    .delete()
    .eq("purchase_request_item_id", itemId)
    .eq("business_id", businessId)
    .is("received_at", null);

  if (source === "stock") {
    const { data: defaultLocation } = await supabase
      .from("stock_locations")
      .select("id")
      .eq("business_id", businessId)
      .eq("is_default_purchase", true)
      .maybeSingle();
    if (!defaultLocation) {
      return { error: "Lokasi default (Gudang Utama) tidak ditemukan. Hubungi admin." };
    }

    const qty = Number(item.approved_qty ?? item.qty_ordered);
    const { error: insertError } = await supabase.from("purchase_request_item_stock_fulfillments").insert({
      business_id: businessId,
      purchase_request_item_id: itemId,
      source_location_id: defaultLocation.id,
      qty,
      marked_by: markedBy?.trim() || null,
    });
    if (insertError) return { error: insertError.message };
  }

  const { error } = await supabase
    .from("purchase_request_items")
    .update({ fulfillment_source: source })
    .eq("id", itemId)
    .eq("business_id", businessId);
  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "info",
    source === "stock" ? `Ditandai ambil dari Gudang Utama: ${item.item_name}` : `Ditandai perlu order ke supplier: ${item.item_name}`,
  );

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

// Lokasi peminta konfirmasi barang "ambil dari gudang" sudah diterima fisik
// -- BARU di sini stok benar-benar pindah (Gudang Utama berkurang, lokasi
// peminta bertambah), bukan saat Purchasing menandai. "masih harus diinput
// dulu distock masuk mereka" (arahan user 2026-08-27).
export async function receiveStockFulfillment(
  businessId: string,
  fulfillmentId: string,
  receivedBy: string,
): Promise<ActionState> {
  if (!receivedBy.trim()) {
    return { error: "Nama penerima wajib diisi." };
  }

  const supabase = await createClient();

  const { data: fulfillment } = await supabase
    .from("purchase_request_item_stock_fulfillments")
    .select("id, purchase_request_item_id, source_location_id, qty, received_at")
    .eq("id", fulfillmentId)
    .eq("business_id", businessId)
    .single();
  if (!fulfillment) return { error: "Data fulfillment tidak ditemukan." };
  if (fulfillment.received_at) return { error: "Barang ini sudah dikonfirmasi diterima sebelumnya." };

  const { data: item } = await supabase
    .from("purchase_request_items")
    .select("id, item_name, unit, ingredient_id, purchase_request_id")
    .eq("id", fulfillment.purchase_request_item_id)
    .single();
  if (!item || !item.ingredient_id) return { error: "Barang tidak ditemukan atau bukan bahan baku." };

  const { data: request } = await supabase
    .from("purchase_requests")
    .select("location_id")
    .eq("id", item.purchase_request_id)
    .single();
  if (!request?.location_id) {
    return { error: "PR ini tidak punya lokasi peminta, tidak bisa terima stok." };
  }

  const qty = Number(fulfillment.qty);

  const { data: sourceRow } = await supabase
    .from("ingredient_location_stock")
    .select("id, stock")
    .eq("location_id", fulfillment.source_location_id)
    .eq("ingredient_id", item.ingredient_id)
    .maybeSingle();
  const sourceStockBefore = Number(sourceRow?.stock ?? 0);
  // Wajib dicek di sini (bukan cuma floor ke 0 lalu tetap kredit lokasi
  // tujuan penuh) -- kalau tidak, stok bisa "muncul dari udara": lokasi
  // tujuan tetap dapat qty penuh walau Gudang Utama sebenarnya tidak
  // sanggup, jadi total stok se-bisnis naik tanpa ada barang fisik masuk.
  if (sourceStockBefore < qty - 1e-9) {
    return {
      error: `Stok Gudang Utama tidak cukup untuk ${item.item_name} (tersedia ${sourceStockBefore} ${item.unit ?? ""}, butuh ${qty} ${item.unit ?? ""}). Sesuaikan dulu stok Gudang Utama, atau perbaiki qty di Permintaan Barang.`,
    };
  }
  if (sourceRow) {
    await supabase
      .from("ingredient_location_stock")
      .update({ stock: sourceStockBefore - qty })
      .eq("id", sourceRow.id);
  }

  const { data: destRow } = await supabase
    .from("ingredient_location_stock")
    .select("id, stock")
    .eq("location_id", request.location_id)
    .eq("ingredient_id", item.ingredient_id)
    .maybeSingle();
  if (destRow) {
    await supabase
      .from("ingredient_location_stock")
      .update({ stock: Number(destRow.stock) + qty })
      .eq("id", destRow.id);
  } else {
    await supabase.from("ingredient_location_stock").insert({
      business_id: businessId,
      location_id: request.location_id,
      ingredient_id: item.ingredient_id,
      stock: qty,
    });
  }

  await supabase
    .from("purchase_request_item_stock_fulfillments")
    .update({ received_at: new Date().toISOString(), received_by: receivedBy.trim() })
    .eq("id", fulfillmentId);

  await supabase.from("stock_adjustments").insert([
    {
      business_id: businessId,
      ingredient_id: item.ingredient_id,
      location_id: fulfillment.source_location_id,
      item_name: item.item_name,
      unit: item.unit,
      stock_before: sourceStockBefore,
      stock_after: sourceStockBefore - qty,
      diff: -qty,
      reason: `Diambil untuk Permintaan Barang (diterima oleh ${receivedBy.trim()})`,
    },
  ]);

  await logActivity(supabase, businessId, "produk", "sukses", `Stok diterima: ${item.item_name}`, `${qty} ${item.unit} — oleh ${receivedBy.trim()}`);

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  revalidatePath(`/business/${businessId}/lokasi/${request.location_id}/bahan-baku`);
  return { error: null };
}

export async function toggleBudgetGate(businessId: string, enabled: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ procurement_budget_gate_enabled: enabled })
    .eq("id", businessId);
  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "warning",
    enabled ? "Gerbang budget PR diaktifkan" : "Gerbang budget PR dimatikan",
  );
  revalidatePath(`/business/${businessId}/rab-pembelian`);
  return { error: null };
}

export async function receivePurchaseRequest(
  businessId: string,
  requestId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_requests")
    .update({ status: "diterima", received_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("business_id", businessId)
    .eq("status", "baru");

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

export async function updateItemApprovedQty(
  businessId: string,
  itemId: string,
  approvedQty: number,
): Promise<ActionState> {
  if (!Number.isFinite(approvedQty) || approvedQty < 0) {
    return { error: "Qty disetujui harus angka 0 atau lebih." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_request_items")
    .update({ approved_qty: approvedQty })
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

// Satu barang bisa dipecah ke beberapa supplier (mis. qty besar, satu
// supplier ga sanggup semua) — tiap panggilan ini nambah satu baris alokasi
// baru untuk barang tsb, tidak menggantikan alokasi yang sudah ada.
export async function addItemAllocation(
  businessId: string,
  itemId: string,
  supplierId: string,
  qty: number,
): Promise<ActionState> {
  if (!supplierId) {
    return { error: "Pilih supplier dulu." };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { error: "Qty harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const gateError = await requiresItemBudgetApproval(supabase, businessId, itemId);
  if (gateError) return { error: gateError };

  const { error } = await supabase.from("purchase_request_item_allocations").insert({
    business_id: businessId,
    purchase_request_item_id: itemId,
    supplier_id: supplierId,
    qty,
  });

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

export async function deleteItemAllocation(
  businessId: string,
  allocationId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_request_item_allocations")
    .delete()
    .eq("id", allocationId)
    .eq("business_id", businessId)
    .is("forwarded_at", null);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

// Diteruskan per SUPPLIER, bukan per alokasi satu-satu — kalau satu supplier
// dapat alokasi dari 10 barang, ini satu kali panggilan (satu WA) yang
// menandai forwarded_at ke-10 alokasi itu sekaligus. Untuk bisnis
// cost-control, momen ini JUGA penerbitan PO resmi (langkah 3 memo) --
// unitPrices/issuedBy dipakai buat itu; bisnis non-cost-control sama sekali
// tidak terdampak (PO tidak dibuat, perilaku persis seperti sebelumnya).
export async function forwardAllocationsToSupplier(
  businessId: string,
  requestId: string,
  allocationIds: string[],
  unitPrices?: Record<string, number>,
  issuedBy?: string,
): Promise<ActionState> {
  if (allocationIds.length === 0) {
    return { error: "Tidak ada barang yang dipilih." };
  }

  const supabase = await createClient();

  const { data: allocations } = await supabase
    .from("purchase_request_item_allocations")
    .select("id, supplier_id, qty, purchase_request_item_id")
    .in("id", allocationIds)
    .eq("business_id", businessId);

  if (!allocations || allocations.length === 0) return { error: "Alokasi tidak ditemukan." };

  const involvedItemIds = [...new Set(allocations.map((a) => a.purchase_request_item_id))];
  for (const involvedItemId of involvedItemIds) {
    const gateError = await requiresItemBudgetApproval(supabase, businessId, involvedItemId);
    if (gateError) return { error: gateError };
  }

  const supplierId = allocations[0].supplier_id;
  if (!supplierId || allocations.some((a) => a.supplier_id !== supplierId)) {
    return { error: "Semua alokasi yang diteruskan bareng harus punya supplier yang sama." };
  }

  const { error } = await supabase
    .from("purchase_request_item_allocations")
    .update({ forwarded_at: new Date().toISOString() })
    .in("id", allocationIds)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  const { data: business } = await supabase
    .from("businesses")
    .select("cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (business?.cost_control_enabled) {
    const { data: itemRows } = await supabase
      .from("purchase_request_items")
      .select("id, item_name, unit")
      .in(
        "id",
        allocations.map((a) => a.purchase_request_item_id),
      );
    const itemById = new Map((itemRows ?? []).map((i) => [i.id, i]));

    const poItems = allocations.map((a) => {
      const item = itemById.get(a.purchase_request_item_id);
      const unitPrice = Number(unitPrices?.[a.id] ?? 0);
      const qty = Number(a.qty);
      return {
        item_name: item?.item_name ?? "(barang)",
        unit: item?.unit ?? "",
        qty,
        unit_price: unitPrice,
        subtotal: Math.round(qty * unitPrice),
      };
    });
    const totalAmount = poItems.reduce((sum, i) => sum + i.subtotal, 0);
    const now = new Date();
    const dateCompact = now.toISOString().slice(0, 10).replaceAll("-", "");
    const poNumber = `PO-${dateCompact}-${Date.now().toString().slice(-6)}`;

    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .insert({
        business_id: businessId,
        po_number: poNumber,
        supplier_id: supplierId,
        purchase_request_id: requestId,
        total_amount: totalAmount,
        issued_by: issuedBy?.trim() || null,
      })
      .select("id")
      .single();

    if (poError || !po) return { error: poError?.message ?? "Gagal menerbitkan PO." };

    await supabase.from("purchase_order_items").insert(
      poItems.map((i) => ({ business_id: businessId, purchase_order_id: po.id, ...i })),
    );

    await supabase
      .from("purchase_request_item_allocations")
      .update({ purchase_order_id: po.id })
      .in("id", allocationIds)
      .eq("business_id", businessId);

    await logActivity(
      supabase,
      businessId,
      "produk",
      "sukses",
      `PO diterbitkan: ${poNumber}`,
      `Rp${totalAmount.toLocaleString("id-ID")} — ${poItems.length} barang`,
    );
    revalidatePath(`/business/${businessId}/purchase-orders`);
  }

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    "Order barang diteruskan ke supplier",
    `${allocations.length} alokasi barang`,
  );

  // Order dianggap "semua diteruskan" kalau tiap barangnya sudah punya
  // minimal 1 alokasi, dan semua alokasi (di semua barang) sudah diteruskan.
  const { data: items } = await supabase
    .from("purchase_request_items")
    .select("id")
    .eq("purchase_request_id", requestId)
    .eq("business_id", businessId);

  const { data: allAllocations } = await supabase
    .from("purchase_request_item_allocations")
    .select("purchase_request_item_id, forwarded_at")
    .eq("business_id", businessId)
    .in("purchase_request_item_id", (items ?? []).map((i) => i.id));

  const itemIdsWithAllocation = new Set((allAllocations ?? []).map((a) => a.purchase_request_item_id));
  const everyItemAllocated = (items ?? []).every((i) => itemIdsWithAllocation.has(i.id));
  const everyAllocationForwarded = (allAllocations ?? []).every((a) => a.forwarded_at !== null);

  if (everyItemAllocated && everyAllocationForwarded) {
    await supabase
      .from("purchase_requests")
      .update({ status: "diteruskan", forwarded_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("business_id", businessId);
  }

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

export async function markAllocationReceived(
  businessId: string,
  allocationId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_request_item_allocations")
    .update({ received_at: new Date().toISOString() })
    .eq("id", allocationId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

// Hapus satu barang dari order — cuma boleh selama belum ada alokasinya yang
// diteruskan ke supplier (kalau sudah diteruskan, hapus jadi tidak masuk
// akal karena supplier sudah dihubungi).
export async function deleteRequestItem(businessId: string, itemId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("purchase_request_item_allocations")
    .select("id", { count: "exact", head: true })
    .eq("purchase_request_item_id", itemId)
    .eq("business_id", businessId)
    .not("forwarded_at", "is", null);

  if (count && count > 0) {
    return { error: "Barang ini sudah diteruskan ke supplier, tidak bisa dihapus." };
  }

  const { error } = await supabase
    .from("purchase_request_items")
    .delete()
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

// Hapus seluruh order — buat kesalahan input atau uji coba. Tidak dibatasi
// status, karena menghapus order tidak menyentuh catatan Pembelian yang
// mungkin sudah dibuat (purchase_id di alokasi cuma referensi, bukan
// kepemilikan; purchases record tetap utuh).
export async function deleteRequest(businessId: string, requestId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_requests")
    .delete()
    .eq("id", requestId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(supabase, businessId, "produk", "warning", "Order barang dihapus");
  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null };
}

export type RegenerateSlugState = { error: string | null; slug: string | null };

export async function regeneratePurchaseRequestSlug(
  businessId: string,
): Promise<RegenerateSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase
    .from("businesses")
    .update({ purchase_request_slug: slug })
    .eq("id", businessId);

  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link order barang diganti");
  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return { error: null, slug };
}
