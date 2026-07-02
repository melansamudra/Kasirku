"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const emoji = (formData.get("emoji") as string)?.trim();

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

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    business_id: businessId,
    name,
    category: category || null,
    price,
    cost,
    stock,
    emoji: emoji || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/products`);
  return { error: null };
}
