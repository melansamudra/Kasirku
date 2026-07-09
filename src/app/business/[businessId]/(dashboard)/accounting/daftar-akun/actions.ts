"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AccountState = { error: string | null };

const VALID_TYPES = new Set(["aset", "kewajiban", "modal", "pendapatan", "beban"]);

export async function addAccount(
  businessId: string,
  _prevState: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const code = (formData.get("code") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string;

  if (!code) {
    return { error: "Kode akun wajib diisi." };
  }
  if (!name) {
    return { error: "Nama akun wajib diisi." };
  }
  if (!VALID_TYPES.has(type)) {
    return { error: "Jenis akun tidak valid." };
  }

  const normalBalance = type === "aset" || type === "beban" ? "debit" : "kredit";

  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert({
    business_id: businessId,
    code,
    name,
    type,
    normal_balance: normalBalance,
  });

  if (error) {
    return {
      error: error.code === "23505" ? "Kode akun sudah dipakai." : error.message,
    };
  }

  revalidatePath(`/business/${businessId}/accounting/daftar-akun`);
  return { error: null };
}

export async function deleteAccount(businessId: string, accountId: string) {
  const supabase = await createClient();
  await supabase
    .from("accounts")
    .delete()
    .eq("id", accountId)
    .eq("business_id", businessId)
    .eq("is_system", false);
  revalidatePath(`/business/${businessId}/accounting/daftar-akun`);
}
