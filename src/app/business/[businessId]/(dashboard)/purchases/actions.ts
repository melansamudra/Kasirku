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

export type AddPurchaseState = { error: string | null };

export async function addPurchase(
  businessId: string,
  _prevState: AddPurchaseState,
  formData: FormData,
): Promise<AddPurchaseState> {
  const supplierId = (formData.get("supplierId") as string) || null;
  const date = formData.get("date") as string;
  const category = formData.get("category") as string;
  const note = (formData.get("note") as string)?.trim();
  const amountRaw = formData.get("amount") as string;
  const paidAmountRaw = formData.get("paidAmount") as string;
  const qtyRaw = formData.get("qty") as string;

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }
  if (category !== "Bahan Baku" && category !== "Barang Dagang") {
    return { error: "Kategori tidak valid." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Total pembelian harus angka lebih dari 0." };
  }

  const paidAmount = paidAmountRaw ? Number(paidAmountRaw) : 0;
  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    return { error: "Jumlah dibayar harus angka dan tidak boleh negatif." };
  }
  if (paidAmount > amount) {
    return { error: "Jumlah dibayar tidak boleh lebih besar dari total pembelian." };
  }

  const qty = Number(qtyRaw);
  if (!qtyRaw || Number.isNaN(qty) || qty <= 0) {
    return { error: "Qty dibeli harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  let ingredientId: string | null = null;
  let productId: string | null = null;
  let itemName = "";

  if (category === "Bahan Baku") {
    ingredientId = formData.get("ingredientId") as string;
    if (!ingredientId) {
      return { error: "Pilih bahan yang dibeli." };
    }

    const { data: ingredient } = await supabase
      .from("ingredients")
      .select("id, name, business_id, stock, unit_cost")
      .eq("id", ingredientId)
      .single();

    if (!ingredient || ingredient.business_id !== businessId) {
      return { error: "Bahan baku tidak ditemukan." };
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
      return { error: updateError.message };
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
      return { error: "Pilih produk yang dibeli." };
    }

    const { data: product } = await supabase
      .from("products")
      .select("id, name, business_id, stock, cost")
      .eq("id", productId)
      .single();

    if (!product || product.business_id !== businessId) {
      return { error: "Produk tidak ditemukan." };
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
      return { error: updateError.message };
    }
  }

  const { error } = await supabase.from("purchases").insert({
    business_id: businessId,
    supplier_id: supplierId,
    date,
    category,
    ingredient_id: ingredientId,
    product_id: productId,
    qty,
    note: note || null,
    amount,
    paid_amount: paidAmount,
  });

  if (error) {
    return { error: error.message };
  }

  const journalError = await postPurchaseJournal(
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
      : `Rp${amount.toLocaleString("id-ID")}${paidAmount < amount ? " · sebagian/seluruhnya utang" : " · lunas"}`,
  );

  revalidatePath(`/business/${businessId}/purchases`);
  revalidatePath(`/business/${businessId}/suppliers`);
  return {
    error: journalError
      ? `Pembelian tersimpan, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
      : null,
  };
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
    .select("id, business_id, amount, paid_amount, ingredient_id, product_id")
    .eq("id", purchaseId)
    .eq("business_id", businessId)
    .single();

  if (!purchase) {
    return { error: "Data pembelian tidak ditemukan." };
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
