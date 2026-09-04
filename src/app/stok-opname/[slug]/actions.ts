"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitStockOpnameResult =
  | { success: true; entriesCount: number }
  | { success: false; error: string };

type CountInput = { id: string; stock: number };
type NewItemInput = { name: string; unit: string; stock: number };

export async function submitStockOpname(
  slug: string,
  employeeId: string,
  locationId: string,
  ingredientCounts: CountInput[],
  semiFinishedCounts: CountInput[],
  entryDate?: string,
  newIngredients: NewItemInput[] = [],
  newSemiFinished: NewItemInput[] = [],
  sectionId?: string,
): Promise<SubmitStockOpnameResult> {
  if (!employeeId) {
    return { success: false, error: "Pilih nama dulu." };
  }
  if (!locationId) {
    return { success: false, error: "Lokasi tidak diketahui." };
  }
  if (
    ingredientCounts.length === 0 &&
    semiFinishedCounts.length === 0 &&
    newIngredients.length === 0 &&
    newSemiFinished.length === 0
  ) {
    return { success: false, error: "Belum ada bahan yang diisi stok fisiknya." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_stock_opname", {
    p_slug: slug,
    p_employee_id: employeeId,
    p_location_id: locationId,
    p_ingredient_counts: ingredientCounts,
    p_semi_finished_counts: semiFinishedCounts,
    p_entry_date: entryDate || null,
    p_new_ingredients: newIngredients,
    p_new_semi_finished: newSemiFinished,
    p_section_id: sectionId || null,
  });

  if (error) {
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  const entriesCount = (data as { entries_count?: number } | null)?.entries_count ?? 0;
  return { success: true, entriesCount };
}
