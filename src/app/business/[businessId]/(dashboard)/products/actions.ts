"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { parseCsv } from "@/lib/csv";

export type AddProductState = { error: string | null };

export async function addProduct(
  businessId: string,
  _prevState: AddProductState,
  formData: FormData,
): Promise<AddProductState> {
  const name = (formData.get("name") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();
  const priceRaw = formData.get("price") as string;
  const costRaw = formData.get("cost") as string;
  const stockRaw = formData.get("stock") as string;
  const minStockRaw = formData.get("minStock") as string;
  const emoji = (formData.get("emoji") as string)?.trim();
  const barcode = (formData.get("barcode") as string)?.trim();
  const sku = (formData.get("sku") as string)?.trim();
  const variantLabel = (formData.get("variantLabel") as string)?.trim();

  if (!name) {
    return { error: "Nama produk wajib diisi." };
  }

  const price = Number(priceRaw);
  if (!priceRaw || Number.isNaN(price) || price < 0) {
    return { error: "Harga jual harus angka dan tidak boleh negatif." };
  }

  const cost = costRaw ? Number(costRaw) : 0;
  if (Number.isNaN(cost) || cost < 0) {
    return { error: "Modal (HPP) harus angka dan tidak boleh negatif." };
  }

  const stock = stockRaw ? Number(stockRaw) : 0;
  if (Number.isNaN(stock) || stock < 0) {
    return { error: "Stok harus angka dan tidak boleh negatif." };
  }

  const minStock = minStockRaw ? Number(minStockRaw) : 0;
  if (Number.isNaN(minStock) || minStock < 0) {
    return { error: "Stok minimum harus angka dan tidak boleh negatif." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    business_id: businessId,
    name,
    category: category || null,
    price,
    cost,
    stock,
    min_stock: minStock,
    emoji: emoji || null,
    barcode: barcode || null,
    sku: sku || null,
    variant_label: variantLabel || null,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        error: error.message.includes("sku")
          ? "SKU ini sudah dipakai produk lain."
          : "Barcode ini sudah dipakai produk lain.",
      };
    }
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Produk baru: ${name}`,
    `Harga Rp${price.toLocaleString("id-ID")} · stok ${stock}`,
  );
  revalidatePath(`/business/${businessId}/products`);
  return { error: null };
}

export type EditProductState = { error: string | null };

export async function editProduct(
  businessId: string,
  productId: string,
  _prevState: EditProductState,
  formData: FormData,
): Promise<EditProductState> {
  const name = (formData.get("name") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();
  const priceRaw = formData.get("price") as string;
  const costRaw = formData.get("cost") as string;
  const minStockRaw = formData.get("minStock") as string;
  const emoji = (formData.get("emoji") as string)?.trim();
  const barcode = (formData.get("barcode") as string)?.trim();
  const sku = (formData.get("sku") as string)?.trim();
  const variantLabel = (formData.get("variantLabel") as string)?.trim();

  if (!name) {
    return { error: "Nama produk wajib diisi." };
  }

  const price = Number(priceRaw);
  if (!priceRaw || Number.isNaN(price) || price < 0) {
    return { error: "Harga jual harus angka dan tidak boleh negatif." };
  }

  const cost = costRaw ? Number(costRaw) : 0;
  if (Number.isNaN(cost) || cost < 0) {
    return { error: "Modal (HPP) harus angka dan tidak boleh negatif." };
  }

  const minStock = minStockRaw ? Number(minStockRaw) : 0;
  if (Number.isNaN(minStock) || minStock < 0) {
    return { error: "Stok minimum harus angka dan tidak boleh negatif." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      name,
      category: category || null,
      price,
      cost,
      min_stock: minStock,
      emoji: emoji || null,
      barcode: barcode || null,
      sku: sku || null,
      variant_label: variantLabel || null,
    })
    .eq("id", productId)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") {
      return {
        error: error.message.includes("sku")
          ? "SKU ini sudah dipakai produk lain."
          : "Barcode ini sudah dipakai produk lain.",
      };
    }
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "info", `Produk diubah: ${name}`);
  revalidatePath(`/business/${businessId}/products`);
  return { error: null };
}

export type AdjustStockResult = { error: string | null };

export async function adjustProductStock(
  businessId: string,
  productId: string,
  newStock: number,
  reason: string,
): Promise<AdjustStockResult> {
  if (Number.isNaN(newStock) || newStock < 0) {
    return { error: "Stok fisik harus angka dan tidak boleh negatif." };
  }
  reason = reason.trim();
  if (!reason) {
    return { error: "Alasan penyesuaian wajib diisi." };
  }

  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, stock")
    .eq("id", productId)
    .eq("business_id", businessId)
    .single();

  if (!product) {
    return { error: "Produk tidak ditemukan." };
  }

  const stockBefore = Number(product.stock);
  const diff = newStock - stockBefore;

  if (diff === 0) {
    return { error: "Stok fisik sama dengan stok sistem, tidak ada yang disesuaikan." };
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ stock: newStock })
    .eq("id", productId);

  if (updateError) {
    return { error: updateError.message };
  }

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    product_id: productId,
    item_name: product.name,
    stock_before: stockBefore,
    stock_after: newStock,
    diff,
    reason,
  });

  await logActivity(
    supabase,
    businessId,
    "produk",
    "warning",
    `Penyesuaian stok: ${product.name}`,
    `${stockBefore} → ${newStock} (${diff > 0 ? "+" : ""}${diff}) · ${reason}`,
  );
  revalidatePath(`/business/${businessId}/products`);
  return { error: null };
}

export async function deleteProduct(businessId: string, productId: string) {
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("name")
    .eq("id", productId)
    .eq("business_id", businessId)
    .maybeSingle();

  await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("business_id", businessId);

  if (product) {
    await logActivity(supabase, businessId, "produk", "warning", `Produk dihapus: ${product.name}`);
  }
  revalidatePath(`/business/${businessId}/products`);
}

export type ImportProductsState = {
  error: string | null;
  result: { created: number; updated: number; skipped: number; errors: string[] } | null;
};

// Matches export/route.ts's column order exactly, so a downloaded-then-
// re-uploaded file round-trips without edits.
const IMPORT_COLUMNS = [
  "name",
  "category",
  "price",
  "cost",
  "stock",
  "minStock",
  "barcode",
  "sku",
  "variantLabel",
  "emoji",
] as const;

export async function importProducts(
  businessId: string,
  _prevState: ImportProductsState,
  formData: FormData,
): Promise<ImportProductsState> {
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

  const { data: existing } = await supabase
    .from("products")
    .select("id, sku, barcode")
    .eq("business_id", businessId)
    .is("deleted_at", null);

  const bySku = new Map(
    (existing ?? []).filter((p) => p.sku).map((p) => [p.sku as string, p.id]),
  );
  const byBarcode = new Map(
    (existing ?? []).filter((p) => p.barcode).map((p) => [p.barcode as string, p.id]),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const line = i + 2; // +1 for header, +1 for 1-indexing
    const get = (col: (typeof IMPORT_COLUMNS)[number]) =>
      row[IMPORT_COLUMNS.indexOf(col)]?.trim() || "";

    const name = get("name");
    if (!name) {
      skipped++;
      errors.push(`Baris ${line}: nama produk kosong`);
      continue;
    }
    const price = Number(get("price"));
    if (get("price") === "" || Number.isNaN(price) || price < 0) {
      skipped++;
      errors.push(`Baris ${line}: harga jual tidak valid`);
      continue;
    }
    const cost = Number(get("cost")) || 0;
    const stock = Number(get("stock")) || 0;
    const minStock = Number(get("minStock")) || 0;
    const category = get("category") || null;
    const barcode = get("barcode") || null;
    const sku = get("sku") || null;
    const variantLabel = get("variantLabel") || null;
    const emoji = get("emoji") || null;

    const record = {
      name,
      category,
      price,
      cost,
      stock,
      min_stock: minStock,
      barcode,
      sku,
      variant_label: variantLabel,
      emoji,
    };

    const matchId = (sku && bySku.get(sku)) || (barcode && byBarcode.get(barcode)) || null;

    if (matchId) {
      const { error } = await supabase
        .from("products")
        .update(record)
        .eq("id", matchId)
        .eq("business_id", businessId);
      if (error) {
        skipped++;
        errors.push(`Baris ${line}: ${error.message}`);
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase
        .from("products")
        .insert({ business_id: businessId, ...record });
      if (error) {
        skipped++;
        errors.push(`Baris ${line}: ${error.message}`);
      } else {
        created++;
      }
    }
  }

  await logActivity(
    supabase,
    businessId,
    "produk",
    skipped > 0 ? "warning" : "sukses",
    `Impor CSV produk: ${created} baru, ${updated} diperbarui, ${skipped} dilewati`,
  );
  revalidatePath(`/business/${businessId}/products`);
  return { error: null, result: { created, updated, skipped, errors: errors.slice(0, 20) } };
}
