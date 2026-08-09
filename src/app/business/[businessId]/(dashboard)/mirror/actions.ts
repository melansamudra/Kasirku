"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
    show_invoice_number: formData.get("show_invoice_number") === "on",
    show_payment_method: formData.get("show_payment_method") === "on",
    show_items: formData.get("show_items") === "on",
  };

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "";

  // Invite client pakai implicit flow supaya link di email berformat
  // #access_token=... (hash) bukan ?code= (PKCE), agar bisa dibaca oleh
  // set-password/page.tsx yang menggunakan createRecoveryClient.
  const inviteClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, flowType: "implicit" } },
  );
  let invitedUserId: string;

  try {
    const { data, error: inviteError } = await inviteClient.auth.admin.inviteUserByEmail(
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
    show_invoice_number: formData.get("show_invoice_number") === "on",
    show_payment_method: formData.get("show_payment_method") === "on",
    show_items: formData.get("show_items") === "on",
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
): Promise<{ error: string | null }> {
  try {
    await assertIsOwner(businessId);
  } catch {
    return { error: "Tidak diizinkan." };
  }

  const service = createServiceClient();
  const selectedIds = formData.getAll("tx_id") as string[];

  const { error: delErr } = await service
    .from("mirror_selections")
    .delete()
    .eq("mirror_account_id", mirrorAccountId)
    .eq("business_id", businessId);

  if (delErr) {
    console.error("[mirror_selections] delete error:", delErr);
    return { error: `Gagal hapus seleksi lama: ${delErr.message}` };
  }

  if (selectedIds.length > 0) {
    const { error: insErr } = await service.from("mirror_selections").insert(
      selectedIds.map((tid) => ({
        mirror_account_id: mirrorAccountId,
        transaction_id: tid,
        business_id: businessId,
      })),
    );
    if (insErr) {
      console.error("[mirror_selections] insert error:", insErr);
      return { error: `Gagal simpan: ${insErr.message}` };
    }
  }

  revalidatePath(`/business/${businessId}/mirror`);
  revalidatePath(`/business/${businessId}/mirror/${mirrorAccountId}`);
  return { error: null };
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
