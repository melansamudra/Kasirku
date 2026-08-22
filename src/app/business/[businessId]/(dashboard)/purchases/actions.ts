"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { recalculateProductCostsForIngredient } from "@/lib/recalculate-product-cost";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Return value: pesan error kalau posting jurnal gagal, null kalau sukses —
// baris purchases sudah kadung tersimpan di titik pemanggilan, jadi kegagalan
// di sini hanya dilaporkan, bukan membatalkan pembelian (lihat [[mini-erp-scope]]).
async function postPurchaseJournal(
  supabase: SupabaseServerClient,
  businessId: string,
  date: string,
  description: string,
  amount: number,
  paidAmount: number,
): Promise<string | null> {
  const lines: { account_code: string; debit: number; credit: number }[] = [
    { account_code: "1-200", debit: amount, credit: 0 },
  ];
  if (paidAmount > 0) {
    lines.push({ account_code: "1-001", debit: 0, credit: paidAmount });
  }
  const sisaUtang = amount - paidAmount;
  if (sisaUtang > 0) {
    lines.push({ account_code: "2-001", debit: 0, credit: sisaUtang });
  }
  const { error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: description,
    p_lines: lines,
  });
  return error?.message ?? null;
}

export type AddPurchaseState = { error: string | null; resetToken: number };

export async function addPurchase(
  businessId: string,
  prevState: AddPurchaseState,
  formData: FormData,
): Promise<AddPurchaseState> {
  const fail = (msg: string): AddPurchaseState => ({ error: msg, resetToken: prevState.resetToken });

  const supplierId = (formData.get("supplierId") as string) || null;
  const date = formData.get("date") as string;
  const dueDate = (formData.get("dueDate") as string) || null;
  const category = formData.get("category") as string;
  const note = (formData.get("note") as string)?.trim();
  const amountRaw = formData.get("amount") as string;
  const paidAmountRaw = formData.get("paidAmount") as string;
  const qtyRaw = formData.get("qty") as string;
  // Kas sudah tercatat di tempat lain (mis. sudah disetujui/dibayar lewat
  // Kas Kecil) -- entri ini cuma untuk update stok+unit cost, sama sekali
  // tidak boleh posting ke Kas & Bank/Utang Dagang, supaya kas tidak
  // tercatat dua kali untuk pengeluaran fisik yang sama.
  const stockOnly = formData.get("stockOnly") === "on";

  if (!date) {
    return fail("Tanggal wajib diisi.");
  }
  if (!["Bahan Baku", "Barang Dagang", "Lainnya"].includes(category)) {
    return fail("Kategori tidak valid.");
  }
  if (stockOnly && category === "Lainnya") {
    return fail("\"Cuma update stok\" cuma berlaku untuk kategori Bahan Baku/Barang Dagang.");
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return fail("Total pembelian harus angka lebih dari 0.");
  }

  // stockOnly selalu dianggap lunas (tidak ada konsep utang di sini -- kas
  // untuk pembelian ini sudah selesai dicatat di alur lain).
  const paidAmount = stockOnly ? amount : paidAmountRaw ? Number(paidAmountRaw) : 0;
  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    return fail("Jumlah dibayar harus angka dan tidak boleh negatif.");
  }
  if (paidAmount > amount) {
    return fail("Jumlah dibayar tidak boleh lebih besar dari total pembelian.");
  }

  const supabase = await createClient();

  let ingredientId: string | null = null;
  let productId: string | null = null;
  let itemName = "";
  let qty = 0;

  if (category === "Lainnya") {
    // Catatan cepat — tidak perlu item atau qty, stok tidak diubah
    itemName = note || "Pembelian";
  } else {
    const qtyVal = Number(qtyRaw);
    if (!qtyRaw || Number.isNaN(qtyVal) || qtyVal <= 0) {
      return fail("Qty dibeli harus angka lebih dari 0.");
    }
    qty = qtyVal;

    if (category === "Bahan Baku") {
      ingredientId = formData.get("ingredientId") as string;
      if (!ingredientId) {
        return fail("Pilih bahan yang dibeli.");
      }

      const { data: ingredient } = await supabase
        .from("ingredients")
        .select("id, name, business_id, stock, unit_cost")
        .eq("id", ingredientId)
        .single();

      if (!ingredient || ingredient.business_id !== businessId) {
        return fail("Bahan baku tidak ditemukan.");
      }
      itemName = ingredient.name;

      const oldValue = Number(ingredient.stock) * Number(ingredient.unit_cost);
      const newStock = Number(ingredient.stock) + qty;
      const newUnitCost =
        newStock > 0 ? Math.round((oldValue + amount) / newStock) : Number(ingredient.unit_cost);

      const { error: updateError } = await supabase
        .from("ingredients")
        .update({ stock: newStock, unit_cost: newUnitCost })
        .eq("id", ingredientId);

      if (updateError) {
        return fail(updateError.message);
      }

      if (newUnitCost !== Number(ingredient.unit_cost)) {
        await supabase.from("ingredient_price_history").insert({
          business_id: businessId,
          ingredient_id: ingredientId,
          unit_cost: newUnitCost,
          source: "pembelian",
        });
        await recalculateProductCostsForIngredient(supabase, ingredientId);
      }
    } else {
      productId = formData.get("productId") as string;
      if (!productId) {
        return fail("Pilih produk yang dibeli.");
      }

      const { data: product } = await supabase
        .from("products")
        .select("id, name, business_id, stock, cost")
        .eq("id", productId)
        .single();

      if (!product || product.business_id !== businessId) {
        return fail("Produk tidak ditemukan.");
      }
      itemName = product.name;

      const oldValue = Number(product.stock) * Number(product.cost);
      const newStock = Number(product.stock) + qty;
      const newCost = newStock > 0 ? Math.round((oldValue + amount) / newStock) : Number(product.cost);

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock: newStock, cost: newCost })
        .eq("id", productId);

      if (updateError) {
        return fail(updateError.message);
      }
    }
  }

  const { data: newPurchase, error } = await supabase
    .from("purchases")
    .insert({
      business_id: businessId,
      supplier_id: supplierId,
      date,
      due_date: dueDate,
      category,
      ingredient_id: ingredientId,
      product_id: productId,
      qty,
      note: note || null,
      amount,
      paid_amount: paidAmount,
      stock_only: stockOnly,
    })
    .select("id")
    .single();

  if (error) {
    return fail(error.message);
  }

  // Kalau datang dari tombol "Catat sebagai Pembelian" di Permintaan Barang,
  // link balik alokasinya ke pembelian ini biar riwayatnya nyambung —
  // best-effort, kegagalan di sini tidak membatalkan pembelian yang sudah
  // tersimpan.
  const fromAllocationId = (formData.get("fromAllocationId") as string) || null;
  if (fromAllocationId) {
    await supabase
      .from("purchase_request_item_allocations")
      .update({ purchase_id: newPurchase.id })
      .eq("id", fromAllocationId)
      .eq("business_id", businessId);
    revalidatePath(`/business/${businessId}/permintaan-barang`);
  }

  const journalError = stockOnly
    ? null
    : await postPurchaseJournal(
        supabase,
        businessId,
        date,
        `Pembelian: ${itemName}`,
        amount,
        paidAmount,
      );

  await logActivity(
    supabase,
    businessId,
    "produk",
    journalError ? "warning" : "sukses",
    `Pembelian: ${itemName}`,
    journalError
      ? `Rp${amount.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : stockOnly
        ? `Rp${amount.toLocaleString("id-ID")} · cuma update stok, kas tidak disentuh`
        : `Rp${amount.toLocaleString("id-ID")}${paidAmount < amount ? " · sebagian/seluruhnya utang" : " · lunas"}`,
  );

  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/suppliers`);
  return journalError
    ? fail(
        `Pembelian tersimpan, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`,
      )
    : { error: null, resetToken: prevState.resetToken + 1 };
}

export type VoidPurchaseState = { error: string | null };

// Batalkan pembelian — bukan hapus baris, tapi ditandai voided + otomatis
// membalik efeknya: stok bahan/produk yang sempat bertambah dikurangi lagi
// (di-floor ke 0, tidak boleh negatif — kalau sebagian stok itu sudah
// kepakai/kejual duluan, sisanya hilang begitu saja, tidak dipaksa minus),
// unit_cost dibalikkan pakai kebalikan rumus rata-rata tertimbang (best
// effort — akurat kalau belum ada pembelian/penyesuaian lain sejak itu,
// yang merupakan kasus umum untuk "baru salah input, langsung dibatalkan"),
// dan jurnal koreksi (kebalikan dari jurnal saat pembelian dicatat,
// berdasarkan paid_amount TERKINI — termasuk pembayaran cicilan yang mungkin
// sudah ditambahkan lewat purchase_payments).
export async function voidPurchase(
  businessId: string,
  purchaseId: string,
  reason: string,
): Promise<VoidPurchaseState> {
  reason = reason.trim();
  if (!reason) {
    return { error: "Alasan pembatalan wajib diisi." };
  }

  const supabase = await createClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, date, category, ingredient_id, product_id, qty, amount, paid_amount, voided, stock_only")
    .eq("id", purchaseId)
    .eq("business_id", businessId)
    .single();

  if (!purchase) {
    return { error: "Data pembelian tidak ditemukan." };
  }
  if (purchase.voided) {
    return { error: "Pembelian ini sudah dibatalkan sebelumnya." };
  }

  let itemName = "Pembelian";
  const purchaseQty = Number(purchase.qty);
  const purchaseAmount = Number(purchase.amount);

  if (purchase.category === "Bahan Baku" && purchase.ingredient_id) {
    const { data: ingredient } = await supabase
      .from("ingredients")
      .select("id, name, stock, unit_cost")
      .eq("id", purchase.ingredient_id)
      .single();

    if (ingredient) {
      itemName = ingredient.name;
      const stockBefore = Number(ingredient.stock);
      const unitCostBefore = Number(ingredient.unit_cost);
      const stockAfter = Math.max(0, stockBefore - purchaseQty);
      const valueAfter = stockBefore * unitCostBefore - purchaseAmount;
      const unitCostAfter = stockAfter > 0 ? Math.max(0, Math.round(valueAfter / stockAfter)) : unitCostBefore;

      const { error: updateError } = await supabase
        .from("ingredients")
        .update({ stock: stockAfter, unit_cost: unitCostAfter })
        .eq("id", purchase.ingredient_id);
      if (updateError) return { error: updateError.message };

      if (unitCostAfter !== unitCostBefore) {
        await supabase.from("ingredient_price_history").insert({
          business_id: businessId,
          ingredient_id: purchase.ingredient_id,
          unit_cost: unitCostAfter,
          source: "manual",
        });
        await recalculateProductCostsForIngredient(supabase, purchase.ingredient_id);
      }
    }
  } else if (purchase.category === "Barang Dagang" && purchase.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("id, name, stock, cost")
      .eq("id", purchase.product_id)
      .single();

    if (product) {
      itemName = product.name;
      const stockBefore = Number(product.stock);
      const costBefore = Number(product.cost);
      const stockAfter = Math.max(0, stockBefore - purchaseQty);
      const valueAfter = stockBefore * costBefore - purchaseAmount;
      const costAfter = stockAfter > 0 ? Math.max(0, Math.round(valueAfter / stockAfter)) : costBefore;

      const { error: updateError } = await supabase
        .from("products")
        .update({ stock: stockAfter, cost: costAfter })
        .eq("id", purchase.product_id);
      if (updateError) return { error: updateError.message };
    }
  }

  const amount = Number(purchase.amount);
  const paidAmount = Number(purchase.paid_amount);
  const sisaUtang = amount - paidAmount;

  // stock_only tidak pernah posting jurnal saat dicatat (lihat addPurchase),
  // jadi tidak ada apa pun untuk dibalikkan di sini juga.
  let journalError: string | null = null;
  if (!purchase.stock_only) {
    const reversalLines: { account_code: string; debit: number; credit: number }[] = [
      { account_code: "1-200", debit: 0, credit: amount },
    ];
    if (paidAmount > 0) {
      reversalLines.push({ account_code: "1-001", debit: paidAmount, credit: 0 });
    }
    if (sisaUtang > 0) {
      reversalLines.push({ account_code: "2-001", debit: sisaUtang, credit: 0 });
    }
    const { error: journalRpcError } = await supabase.rpc("post_journal_entry", {
      p_business_id: businessId,
      p_date: new Date().toISOString().slice(0, 10),
      p_description: `Batal pembelian: ${itemName}`,
      p_lines: reversalLines,
    });
    journalError = journalRpcError?.message ?? null;
  }

  const { error } = await supabase
    .from("purchases")
    .update({ voided: true, voided_at: new Date().toISOString(), void_reason: reason })
    .eq("id", purchaseId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  // Lepas link ke Permintaan Barang biar tombol "Catat sebagai Pembelian"
  // muncul lagi kalau mau dicatat ulang.
  await supabase
    .from("purchase_request_item_allocations")
    .update({ purchase_id: null })
    .eq("purchase_id", purchaseId)
    .eq("business_id", businessId);

  await logActivity(
    supabase,
    businessId,
    "produk",
    journalError ? "warning" : "warning",
    `Pembelian dibatalkan: ${itemName}`,
    journalError
      ? `${reason} — GAGAL posting jurnal koreksi: ${journalError}`
      : reason,
  );

  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/suppliers`);
  revalidatePath(`/business/${businessId}/permintaan-barang`);
  return journalError
    ? {
        error: `Pembelian dibatalkan, tapi gagal posting jurnal koreksi (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`,
      }
    : { error: null };
}

export type AddPaymentState = { error: string | null };

export async function addPurchasePayment(
  businessId: string,
  purchaseId: string,
  _prevState: AddPaymentState,
  formData: FormData,
): Promise<AddPaymentState> {
  const date = formData.get("date") as string;
  const amountRaw = formData.get("amount") as string;
  const note = (formData.get("note") as string)?.trim();

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Jumlah bayar harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, business_id, amount, paid_amount, ingredient_id, product_id, voided")
    .eq("id", purchaseId)
    .eq("business_id", businessId)
    .single();

  if (!purchase) {
    return { error: "Data pembelian tidak ditemukan." };
  }
  if (purchase.voided) {
    return { error: "Pembelian ini sudah dibatalkan, tidak bisa dibayar." };
  }

  const sisaUtang = Number(purchase.amount) - Number(purchase.paid_amount);
  if (amount > sisaUtang) {
    return { error: `Jumlah bayar melebihi sisa utang (${sisaUtang.toLocaleString("id-ID")}).` };
  }

  const newPaidAmount = Number(purchase.paid_amount) + amount;

  const { error: updateError } = await supabase
    .from("purchases")
    .update({ paid_amount: newPaidAmount })
    .eq("id", purchaseId);

  if (updateError) {
    return { error: updateError.message };
  }

  const { error } = await supabase.from("purchase_payments").insert({
    business_id: businessId,
    purchase_id: purchaseId,
    date,
    amount,
    note: note || null,
  });

  if (error) {
    return { error: error.message };
  }

  const { error: journalRpcError } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: "Bayar utang dagang",
    p_lines: [
      { account_code: "2-001", debit: amount, credit: 0 },
      { account_code: "1-001", debit: 0, credit: amount },
    ],
  });
  const journalError = journalRpcError?.message ?? null;

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "info",
    "Bayar utang dagang",
    journalError
      ? `Rp${amount.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : `Rp${amount.toLocaleString("id-ID")}${note ? ` · ${note}` : ""}`,
  );

  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/suppliers`);
  return {
    error: journalError
      ? `Pembayaran tersimpan, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
      : null,
  };
}
