"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

const PURCHASE_INGREDIENT_CATEGORY = "Pembelian Bahan Baku";
const PURCHASE_PRODUCT_CATEGORY = "Pembelian Barang Dagang";

export type ExpenseState = { error: string | null };

export async function addExpense(
  businessId: string,
  _prevState: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const date = formData.get("date") as string;
  const category = (formData.get("category") as string)?.trim();
  const amountRaw = formData.get("amount") as string;
  const note = (formData.get("note") as string)?.trim();

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }
  if (!category) {
    return { error: "Kategori wajib diisi." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Jumlah harus angka lebih dari 0." };
  }

  const isIngredientPurchase = category === PURCHASE_INGREDIENT_CATEGORY;
  const isProductPurchase = category === PURCHASE_PRODUCT_CATEGORY;

  const supabase = await createClient();

  let ingredientId: string | null = null;
  let productId: string | null = null;
  let qty: number | null = null;

  if (isIngredientPurchase) {
    ingredientId = formData.get("ingredientId") as string;
    qty = Number(formData.get("qty") as string);
    if (!ingredientId) {
      return { error: "Pilih bahan yang dibeli." };
    }
    if (!qty || Number.isNaN(qty) || qty <= 0) {
      return { error: "Qty dibeli harus angka lebih dari 0." };
    }

    const { data: ingredient } = await supabase
      .from("ingredients")
      .select("id, business_id, stock, unit_cost")
      .eq("id", ingredientId)
      .single();

    if (!ingredient || ingredient.business_id !== businessId) {
      return { error: "Bahan baku tidak ditemukan." };
    }

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
  }

  if (isProductPurchase) {
    productId = formData.get("productId") as string;
    qty = Number(formData.get("qty") as string);
    if (!productId) {
      return { error: "Pilih produk yang dibeli." };
    }
    if (!qty || Number.isNaN(qty) || qty <= 0) {
      return { error: "Qty dibeli harus angka lebih dari 0." };
    }

    const { data: product } = await supabase
      .from("products")
      .select("id, business_id, stock, cost")
      .eq("id", productId)
      .single();

    if (!product || product.business_id !== businessId) {
      return { error: "Produk tidak ditemukan." };
    }

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

  const { error } = await supabase.from("expenses").insert({
    business_id: businessId,
    date,
    category,
    amount,
    note: note || null,
    ingredient_id: ingredientId,
    product_id: productId,
    qty,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    `Pengeluaran: ${category}`,
    `Rp${amount.toLocaleString("id-ID")}${note ? ` · ${note}` : ""}`,
  );
  revalidatePath(`/business/${businessId}/finance`);
  return { error: null };
}

export async function deleteExpense(businessId: string, expenseId: string) {
  const supabase = await createClient();
  // Menghapus pengeluaran tidak membalik stok/harga bahan atau produk secara
  // otomatis — harga rata-rata tertimbang sudah bercampur dengan pembelian
  // lain. Kalau salah input, sesuaikan stok manual di halaman terkait.
  const { data: expense } = await supabase
    .from("expenses")
    .select("category, amount")
    .eq("id", expenseId)
    .eq("business_id", businessId)
    .maybeSingle();
  await supabase.from("expenses").delete().eq("id", expenseId).eq("business_id", businessId);
  if (expense) {
    await logActivity(
      supabase,
      businessId,
      "sistem",
      "warning",
      `Pengeluaran dihapus: ${expense.category}`,
      `Rp${Number(expense.amount).toLocaleString("id-ID")}`,
    );
  }
  revalidatePath(`/business/${businessId}/finance`);
}

export async function setMerchantFeePercent(businessId: string, method: string, feePercent: number) {
  const supabase = await createClient();
  await supabase
    .from("merchant_fees")
    .upsert(
      { business_id: businessId, method, fee_percent: feePercent },
      { onConflict: "business_id,method" },
    );
  revalidatePath(`/business/${businessId}/finance`);
}

export type ReconciliationState = { error: string | null };

export async function addReconciliation(
  businessId: string,
  _prevState: ReconciliationState,
  formData: FormData,
): Promise<ReconciliationState> {
  const date = formData.get("date") as string;
  const method = (formData.get("method") as string)?.trim();
  const amountRaw = formData.get("amount") as string;
  const note = (formData.get("note") as string)?.trim();

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }
  if (!method) {
    return { error: "Pilih metode pembayaran." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Jumlah harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: openShift } = await supabase
    .from("shifts")
    .select("id")
    .eq("business_id", businessId)
    .is("closed_at", null)
    .limit(1)
    .maybeSingle();

  if (openShift) {
    return { error: "Tutup shift dulu sebelum mencatat rekonsiliasi." };
  }

  const { error } = await supabase.from("reconciliations").insert({
    business_id: businessId,
    date,
    method,
    actual_amount: amount,
    note: note || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/finance`);
  return { error: null };
}

export type OpeningInventoryState = { error: string | null };

export async function setOpeningInventory(
  businessId: string,
  anchorDate: string,
  _prevState: OpeningInventoryState,
  formData: FormData,
): Promise<OpeningInventoryState> {
  const valueRaw = formData.get("value") as string;
  const value = Number(valueRaw);

  if (!valueRaw || Number.isNaN(value) || value < 0) {
    return { error: "Nilai persediaan harus angka dan tidak boleh negatif." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_snapshots")
    .upsert(
      { business_id: businessId, date: anchorDate, value, manual: true },
      { onConflict: "business_id,date" },
    );

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/finance`);
  return { error: null };
}
