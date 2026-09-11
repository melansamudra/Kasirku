"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type AdjustStockResult = { error: string | null };

// Sama pola dengan adjustIngredientStock (ingredients/actions.ts), cuma
// menyasar ingredient_location_stock (baris per lokasi) alih-alih kolom
// ingredients.stock tunggal -- lihat catatan di migrasi stock_locations
// kenapa keduanya sengaja dipisah.
export async function adjustIngredientLocationStock(
  businessId: string,
  locationId: string,
  ingredientId: string,
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

  const [{ data: location }, { data: ingredient }, { data: existingRow }] = await Promise.all([
    supabase.from("stock_locations").select("id").eq("id", locationId).eq("business_id", businessId).maybeSingle(),
    supabase
      .from("ingredients")
      .select("id, name, unit")
      .eq("id", ingredientId)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("ingredient_location_stock")
      .select("id, stock")
      .eq("location_id", locationId)
      .eq("ingredient_id", ingredientId)
      .maybeSingle(),
  ]);

  if (!location) {
    return { error: "Lokasi tidak ditemukan." };
  }
  if (!ingredient) {
    return { error: "Bahan baku tidak ditemukan." };
  }

  const stockBefore = Number(existingRow?.stock ?? 0);
  const diff = newStock - stockBefore;

  if (diff === 0) {
    return { error: "Stok fisik sama dengan stok sistem, tidak ada yang disesuaikan." };
  }

  const { error: upsertError } = await supabase.from("ingredient_location_stock").upsert(
    {
      business_id: businessId,
      location_id: locationId,
      ingredient_id: ingredientId,
      stock: newStock,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "location_id,ingredient_id" },
  );

  if (upsertError) {
    return { error: upsertError.message };
  }

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    ingredient_id: ingredientId,
    location_id: locationId,
    item_name: ingredient.name,
    unit: ingredient.unit,
    stock_before: stockBefore,
    stock_after: newStock,
    diff,
    reason,
  });

  await logActivity(
    supabase,
    businessId,
    "produk",
    "info",
    `Stok ${ingredient.name} disesuaikan`,
    `${stockBefore} → ${newStock} ${ingredient.unit} (${reason})`,
  );

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null };
}

// Lokasi diikat ke Bagian tertentu (sync penuh: hapus semua, insert ulang)
// supaya halaman Bahan Baku lokasi ini otomatis cuma tampilkan bahan yang
// termasuk bagian itu -- lihat comment migrasi stock_location_opname_sections.
export async function updateLocationOpnameSections(
  businessId: string,
  locationId: string,
  sectionIds: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error: delError } = await supabase
    .from("stock_location_opname_sections")
    .delete()
    .eq("location_id", locationId)
    .eq("business_id", businessId);
  if (delError) return { error: delError.message };

  if (sectionIds.length > 0) {
    const { error: insError } = await supabase.from("stock_location_opname_sections").insert(
      sectionIds.map((sectionId) => ({
        business_id: businessId,
        location_id: locationId,
        section_id: sectionId,
      })),
    );
    if (insError) return { error: insError.message };
  }

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null };
}

// Kategori PRODUK yang "diklaim" lokasi ini (sync penuh, sama pola dengan
// updateLocationOpnameSections) -- dipakai RPC penjualan buat nentuin lokasi
// mana yang kepotong stok bahannya, didahulukan di atas tebak-tebakan dari
// ketersediaan stok. Lihat migrasi category_based_consumption_location.
export async function updateLocationProductCategories(
  businessId: string,
  locationId: string,
  categories: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("stock_locations")
    .update({ product_categories: categories })
    .eq("id", locationId)
    .eq("business_id", businessId);
  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null };
}

// Toggle per-lokasi Gudang murni: jalur lama ("connected", stok pakai
// ingredients yang sama dengan Kitchen/Bar) vs baru ("standalone", barang
// dicatat sendiri di warehouse_items, tidak nyambung ke resep/Transfer
// Bahan Baku) -- lihat catatan di migrasi warehouse_standalone_mode.
export async function toggleWarehouseMode(
  businessId: string,
  locationId: string,
  mode: "connected" | "standalone",
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("stock_locations")
    .update({ warehouse_mode: mode })
    .eq("id", locationId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "info",
    `Mode stok Gudang diganti`,
    mode === "standalone" ? "Berdiri sendiri (terpisah dari master bahan baku)" : "Terhubung ke master bahan baku",
  );

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null };
}

export type AddWarehouseItemState = { error: string | null };

export async function addWarehouseItem(
  businessId: string,
  locationId: string,
  name: string,
  unit: string,
  initialStock: number,
): Promise<AddWarehouseItemState> {
  name = name.trim();
  unit = unit.trim();
  if (!name) return { error: "Nama barang wajib diisi." };
  if (!unit) return { error: "Satuan wajib diisi." };
  if (Number.isNaN(initialStock) || initialStock < 0) {
    return { error: "Stok awal harus angka dan tidak boleh negatif." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("warehouse_items").insert({
    business_id: businessId,
    location_id: locationId,
    name,
    unit,
    stock: initialStock,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `Barang "${name}" sudah ada di lokasi ini.` };
    }
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null };
}

export async function deleteWarehouseItem(
  businessId: string,
  locationId: string,
  itemId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("warehouse_items")
    .delete()
    .eq("id", itemId)
    .eq("business_id", businessId)
    .eq("location_id", locationId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null };
}

export async function adjustWarehouseItemStock(
  businessId: string,
  locationId: string,
  itemId: string,
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

  const { data: item } = await supabase
    .from("warehouse_items")
    .select("id, name, unit, stock")
    .eq("id", itemId)
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .maybeSingle();

  if (!item) {
    return { error: "Barang tidak ditemukan." };
  }

  const stockBefore = Number(item.stock);
  const diff = newStock - stockBefore;

  if (diff === 0) {
    return { error: "Stok fisik sama dengan stok sistem, tidak ada yang disesuaikan." };
  }

  const { error: updateError } = await supabase
    .from("warehouse_items")
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq("id", itemId);

  if (updateError) {
    return { error: updateError.message };
  }

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    warehouse_item_id: itemId,
    location_id: locationId,
    item_name: item.name,
    unit: item.unit,
    stock_before: stockBefore,
    stock_after: newStock,
    diff,
    reason,
  });

  await logActivity(
    supabase,
    businessId,
    "produk",
    "info",
    `Stok Gudang ${item.name} disesuaikan`,
    `${stockBefore} → ${newStock} ${item.unit} (${reason})`,
  );

  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null };
}

export type RegenerateReceiveSlugState = { error: string | null; slug: string | null };

// Slug per BISNIS (bukan per lokasi, pola sama stock_opname_slug) -- lokasi
// dikunci lewat ?lokasi=<uuid> di URL, dibagikan dari halaman lokasi
// masing-masing lewat ReceiveLinkBox.
export async function regenerateReceiveStockSlug(
  businessId: string,
  locationId: string,
): Promise<RegenerateReceiveSlugState> {
  const supabase = await createClient();
  const slug = crypto.randomUUID().replace(/-/g, "");

  const { error } = await supabase.from("businesses").update({ receive_stock_slug: slug }).eq("id", businessId);

  if (error) return { error: error.message, slug: null };

  await logActivity(supabase, businessId, "pengaturan", "warning", "Link terima barang diganti");
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  return { error: null, slug };
}
