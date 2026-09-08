"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitPublicOpnameState = { error: string | null; success: boolean };

export async function submitPublicOpname(
  slug: string,
  _prevState: SubmitPublicOpnameState,
  formData: FormData,
): Promise<SubmitPublicOpnameState> {
  const entryDate = formData.get("entryDate") as string;
  const submittedByName = (formData.get("submittedByName") as string)?.trim() || null;

  if (!entryDate) return { error: "Tanggal wajib diisi.", success: false };

  const items: { ingredient_id: string; reported_stock: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("reported_")) continue;
    const raw = (value as string)?.trim();
    if (!raw) continue;
    const num = Number(raw);
    if (Number.isNaN(num) || num < 0) continue;
    items.push({ ingredient_id: key.replace("reported_", ""), reported_stock: num });
  }

  if (items.length === 0) {
    return { error: "Isi minimal satu bahan dengan stok fisik yang dihitung.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_ingredient_opname", {
    p_slug: slug,
    p_entry_date: entryDate,
    p_submitted_by_name: submittedByName,
    p_items: items,
  });

  if (error) return { error: error.message, success: false };
  return { error: null, success: true };
}
