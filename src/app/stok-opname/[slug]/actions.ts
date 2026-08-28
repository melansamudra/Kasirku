"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitStockOpnameResult =
  | { success: true; adjustedCount: number }
  | { success: false; error: string };

type CountInput = { id: string; stock: number };

export async function submitStockOpname(
  slug: string,
  employeeId: string,
  locationId: string,
  ingredientCounts: CountInput[],
  semiFinishedCounts: CountInput[],
): Promise<SubmitStockOpnameResult> {
  if (!employeeId) {
    return { success: false, error: "Pilih nama dulu." };
  }
  if (!locationId) {
    return { success: false, error: "Lokasi tidak diketahui." };
  }
  if (ingredientCounts.length === 0 && semiFinishedCounts.length === 0) {
    return { success: false, error: "Belum ada bahan yang diisi stok fisiknya." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_stock_opname", {
    p_slug: slug,
    p_employee_id: employeeId,
    p_location_id: locationId,
    p_ingredient_counts: ingredientCounts,
    p_semi_finished_counts: semiFinishedCounts,
  });

  if (error) {
    return { success: false, error: "Gagal mengirim. Coba lagi." };
  }

  const adjustedCount = (data as { adjusted_count?: number } | null)?.adjusted_count ?? 0;
  return { success: true, adjustedCount };
}
