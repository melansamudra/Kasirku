"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function postAssetJournal(
  supabase: SupabaseServerClient,
  businessId: string,
  date: string,
  description: string,
  amount: number,
): Promise<string | null> {
  const { error } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: date,
    p_description: description,
    p_lines: [
      { account_code: "1-500", debit: amount, credit: 0 },
      { account_code: "1-001", debit: 0, credit: amount },
    ],
  });
  return error?.message ?? null;
}

export type AddAssetState = { error: string | null };

export async function addFixedAsset(
  businessId: string,
  _prevState: AddAssetState,
  formData: FormData,
): Promise<AddAssetState> {
  const name = (formData.get("name") as string)?.trim();
  const purchaseDate = formData.get("purchaseDate") as string;
  const costRaw = formData.get("cost") as string;
  const usefulLifeRaw = formData.get("usefulLifeMonths") as string;
  const salvageRaw = formData.get("salvageValue") as string;

  if (!name) {
    return { error: "Nama aset wajib diisi." };
  }
  if (!purchaseDate) {
    return { error: "Tanggal beli wajib diisi." };
  }

  const cost = Number(costRaw);
  if (!costRaw || Number.isNaN(cost) || cost <= 0) {
    return { error: "Harga beli harus angka lebih dari 0." };
  }

  const usefulLifeMonths = Number(usefulLifeRaw);
  if (!usefulLifeRaw || Number.isNaN(usefulLifeMonths) || usefulLifeMonths <= 0) {
    return { error: "Umur ekonomis harus angka bulan lebih dari 0." };
  }

  const salvageValue = salvageRaw ? Number(salvageRaw) : 0;
  if (Number.isNaN(salvageValue) || salvageValue < 0) {
    return { error: "Nilai residu tidak boleh negatif." };
  }
  if (salvageValue >= cost) {
    return { error: "Nilai residu harus lebih kecil dari harga beli." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("fixed_assets").insert({
    business_id: businessId,
    name,
    purchase_date: purchaseDate,
    cost,
    useful_life_months: usefulLifeMonths,
    salvage_value: salvageValue,
  });

  if (error) {
    return { error: error.message };
  }

  const journalError = await postAssetJournal(
    supabase,
    businessId,
    purchaseDate,
    `Beli Aset Tetap: ${name}`,
    cost,
  );

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "sukses",
    `Aset tetap dicatat: ${name}`,
    journalError
      ? `Rp${cost.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : `Rp${cost.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/assets`);
  return {
    error: journalError
      ? `Aset tersimpan, tapi gagal posting ke jurnal (${journalError}). Tambahkan jurnal koreksi manual di halaman Akuntansi → Jurnal.`
      : null,
  };
}

export type PostDepreciationResult = { error: string | null };

export async function postMonthlyDepreciation(
  businessId: string,
  period: string, // "YYYY-MM-01"
): Promise<PostDepreciationResult> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("depreciation_postings")
    .select("id")
    .eq("business_id", businessId)
    .eq("period", period)
    .maybeSingle();

  if (existing) {
    return { error: "Penyusutan bulan ini sudah pernah diposting." };
  }

  // Any asset purchased within or before the period's month is eligible —
  // not just ones purchased on/before the 1st. `period` is always the first
  // day of its month, so the month's last day is one day before next month.
  const [y, m] = period.split("-").map(Number);
  const periodMonthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const { data: assets } = await supabase
    .from("fixed_assets")
    .select("id, cost, useful_life_months, salvage_value, accumulated_depreciation, purchase_date")
    .eq("business_id", businessId)
    .is("disposed_at", null)
    .lte("purchase_date", periodMonthEnd);

  let totalAmount = 0;
  const updates: { id: string; newAccumulated: number }[] = [];

  for (const a of assets ?? []) {
    const depreciable = Number(a.cost) - Number(a.salvage_value);
    const monthly = depreciable / a.useful_life_months;
    const remaining = depreciable - Number(a.accumulated_depreciation);
    if (remaining <= 0) continue;

    const amount = Math.min(monthly, remaining);
    totalAmount += amount;
    updates.push({ id: a.id, newAccumulated: Number(a.accumulated_depreciation) + amount });
  }

  if (totalAmount <= 0) {
    return { error: "Tidak ada aset yang perlu disusutkan bulan ini." };
  }

  totalAmount = Math.round(totalAmount);

  const { data: entryId, error: journalError } = await supabase.rpc("post_journal_entry", {
    p_business_id: businessId,
    p_date: period,
    p_description: `Beban Penyusutan ${period.slice(0, 7)}`,
    p_lines: [
      { account_code: "5-105", debit: totalAmount, credit: 0 },
      { account_code: "1-501", debit: 0, credit: totalAmount },
    ],
  });

  if (journalError) {
    return { error: journalError.message };
  }

  const { error: insertError } = await supabase.from("depreciation_postings").insert({
    business_id: businessId,
    period,
    total_amount: totalAmount,
    journal_entry_id: entryId,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  for (const u of updates) {
    await supabase
      .from("fixed_assets")
      .update({ accumulated_depreciation: u.newAccumulated })
      .eq("id", u.id);
  }

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "sukses",
    `Penyusutan ${period.slice(0, 7)} diposting`,
    `Rp${totalAmount.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/assets`);
  return { error: null };
}
