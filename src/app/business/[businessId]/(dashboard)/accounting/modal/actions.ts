"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type CapitalDirection = "setoran" | "prive";

export type CapitalMovementState = { error: string | null };

export async function addCapitalMovement(
  businessId: string,
  direction: CapitalDirection,
  _prevState: CapitalMovementState,
  formData: FormData,
): Promise<CapitalMovementState> {
  const date = formData.get("date") as string;
  const description = (formData.get("description") as string)?.trim();
  const amountRaw = formData.get("amount") as string;

  if (!date) {
    return { error: "Tanggal wajib diisi." };
  }
  if (!description) {
    return { error: "Keterangan wajib diisi." };
  }

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Nominal harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const lines =
    direction === "setoran"
      ? [
          { account_code: "1-001", debit: amount, credit: 0 },
          { account_code: "3-001", debit: 0, credit: amount },
        ]
      : [
          { account_code: "3-001", debit: amount, credit: 0 },
          { account_code: "1-001", debit: 0, credit: amount },
        ];

  const label = direction === "setoran" ? "Setoran Modal" : "Ambil Prive";

  const { error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: `${label}: ${description}`,
    p_lines: lines,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "sukses",
    `${label}: ${description}`,
    `Rp${amount.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/accounting/modal`);
  return { error: null };
}
