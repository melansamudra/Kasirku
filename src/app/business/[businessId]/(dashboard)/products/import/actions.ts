"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { recalculateProductCost } from "@/lib/recalculate-product-cost";

export type ImportActionState = { error: string | null; success: boolean };

// Adaptasi dari finished-products/import/actions.ts (saveProdukJadiImport)
// -- BEDA PENTING: products WAJIB punya `price` (dipakai POS), sementara
// template Excel resep tidak bawa harga jual. Jadi menu yang BELUM ada
// sebagai produk TIDAK auto-dibuat (beda dari finished_products yang boleh,
// karena tidak POS-facing) -- harus sudah dibuat manual dulu (nama+harga+
// kategori) di Kelola Produk.
export async function saveProductRecipeImport(
  businessId: string,
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const itemName = (formData.get("itemName") as string)?.trim();
  const porsi = Number(formData.get("porsi"));

  if (!itemName) {
    return { error: "Pilih nama produk dulu.", success: false };
  }
  if (!(porsi > 0)) {
    return { error: "Jumlah Porsi harus lebih dari 0.", success: false };
  }

  const supabase = await createClient();

  const { data: rows, error: stagingErr } = await supabase
    .from("product_import_staging")
    .select("ingredient_id, qty_per_batch, unit")
    .eq("business_id", businessId)
    .eq("item_name", itemName);
  if (stagingErr) return { error: stagingErr.message, success: false };
  if (!rows || rows.length === 0) {
    return { error: "Data resep untuk menu ini tidak ditemukan di data import.", success: false };
  }

  // Cocokkan case-insensitive & spasi longgar -- nama menu di file Excel
  // (sering ALL CAPS) jarang persis sama kapitalisasinya dengan nama di
  // Kelola Produk meski maknanya sama persis, jadi .eq("name", ...) yang
  // case-sensitive salah nganggep produknya "belum ada" padahal sudah ada.
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const { data: candidateProducts } = await supabase
    .from("products")
    .select("id, name")
    .eq("business_id", businessId)
    .is("deleted_at", null);
  const product = (candidateProducts ?? []).find((p) => norm(p.name) === norm(itemName));

  if (!product) {
    return {
      error: `Produk "${itemName}" belum ada di Kelola Produk — buat dulu (nama, harga jual, kategori) baru import resepnya di sini.`,
      success: false,
    };
  }
  const productId = product.id;

  // Re-import bersifat idempotent -- resep lama untuk produk ini dihapus
  // dulu baru diisi ulang dari data import, supaya bisa diulang kalau ada
  // koreksi di file Excel-nya.
  const { error: delErr } = await supabase.from("product_recipes").delete().eq("product_id", productId);
  if (delErr) return { error: delErr.message, success: false };

  const newRows = rows
    .filter((r) => r.qty_per_batch > 0)
    .map((r) => ({
      product_id: productId,
      ingredient_id: r.ingredient_id,
      qty: r.qty_per_batch / porsi,
      unit: r.unit,
    }));
  if (newRows.length === 0) {
    return { error: "Tidak ada bahan dengan qty > 0 untuk disimpan.", success: false };
  }
  const { error: insRecipeErr } = await supabase.from("product_recipes").insert(newRows);
  if (insRecipeErr) return { error: insRecipeErr.message, success: false };

  await recalculateProductCost(supabase, productId);

  await logActivity(supabase, businessId, "produk", "sukses", `Resep produk diimpor dari Data Excel: ${itemName} (${newRows.length} bahan)`);

  revalidatePath(`/business/${businessId}/products`);
  revalidatePath(`/business/${businessId}/products/import`);
  return { error: null, success: true };
}
