"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function assertIsOwner(businessId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from("businesses")
    .select("owner_id, mirroring_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !user || business.owner_id !== user.id) {
    throw new Error("Hanya pemilik toko yang bisa mengelola akun mirror.");
  }
  if (!business.mirroring_enabled) {
    throw new Error("Fitur mirroring belum diaktifkan untuk toko ini.");
  }
  return { supabase };
}

export type InviteMirrorState = { error: string | null };

export async function inviteMirrorAccount(
  businessId: string,
  _prevState: InviteMirrorState,
  formData: FormData,
): Promise<InviteMirrorState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email tidak valid." };
  }

  let supabase;
  try {
    ({ supabase } = await assertIsOwner(businessId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tidak diizinkan." };
  }

  const permissions = {
    show_amount: formData.get("show_amount") === "on",
    show_customer: formData.get("show_customer") === "on",
    show_cashier: formData.get("show_cashier") === "on",
    show_transactions: formData.get("show_transactions") === "on",
    show_purchases: formData.get("show_purchases") === "on",
    show_kas_harian: formData.get("show_kas_harian") === "on",
  };

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "";

  const serviceClient = createServiceClient();
  let invitedUserId: string;

  try {
    const { data, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${origin}/set-password` },
    );
    if (inviteError || !data?.user) {
      return {
        error: inviteError?.message ?? "Gagal mengundang. Kalau email sudah terdaftar, coba email lain.",
      };
    }
    invitedUserId = data.user.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal mengundang." };
  }

  const { error } = await supabase.from("mirror_accounts").insert({
    business_id: businessId,
    invited_email: email,
    user_id: invitedUserId,
    status: "pending",
    permissions,
  });

  if (error) {
    return {
      error: error.code === "23505"
        ? "Email ini sudah terdaftar sebagai akun mirror di toko ini."
        : error.message,
    };
  }

  revalidatePath(`/business/${businessId}/mirror`);
  return { error: null };
}

export async function updateMirrorPermissions(
  businessId: string,
  mirrorAccountId: string,
  formData: FormData,
) {
  let supabase;
  try {
    ({ supabase } = await assertIsOwner(businessId));
  } catch {
    return;
  }

  const permissions = {
    show_amount: formData.get("show_amount") === "on",
    show_customer: formData.get("show_customer") === "on",
    show_cashier: formData.get("show_cashier") === "on",
    show_transactions: formData.get("show_transactions") === "on",
    show_purchases: formData.get("show_purchases") === "on",
    show_kas_harian: formData.get("show_kas_harian") === "on",
  };

  await supabase
    .from("mirror_accounts")
    .update({ permissions })
    .eq("id", mirrorAccountId)
    .eq("business_id", businessId);

  revalidatePath(`/business/${businessId}/mirror`);
}

export async function saveTransactionSelections(
  businessId: string,
  mirrorAccountId: string,
  formData: FormData,
) {
  let supabase;
  try {
    ({ supabase } = await assertIsOwner(businessId));
  } catch {
    return;
  }

  const selectedIds = formData.getAll("tx_id") as string[];

  await supabase
    .from("mirror_selections")
    .delete()
    .eq("mirror_account_id", mirrorAccountId)
    .eq("business_id", businessId);

  if (selectedIds.length > 0) {
    await supabase.from("mirror_selections").insert(
      selectedIds.map((tid) => ({
        mirror_account_id: mirrorAccountId,
        transaction_id: tid,
        business_id: businessId,
      })),
    );
  }

  revalidatePath(`/business/${businessId}/mirror`);
  revalidatePath(`/business/${businessId}/mirror/${mirrorAccountId}`);
}

export async function revokeMirrorAccess(businessId: string, mirrorAccountId: string) {
  const { supabase } = await assertIsOwner(businessId);
  await supabase
    .from("mirror_accounts")
    .delete()
    .eq("id", mirrorAccountId)
    .eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/mirror`);
}
