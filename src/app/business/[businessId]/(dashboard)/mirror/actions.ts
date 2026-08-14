"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity-log";

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
    show_transactions: formData.get("show_transactions") === "on",
    show_items: formData.get("show_items") === "on",
    show_payment_method: formData.get("show_payment_method") === "on",
    show_amount: formData.get("show_amount") === "on",
    show_invoice_number: formData.get("show_invoice_number") === "on",
    show_customer: formData.get("show_customer") === "on",
    show_cashier: formData.get("show_cashier") === "on",
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
    show_transactions: formData.get("show_transactions") === "on",
    show_items: formData.get("show_items") === "on",
    show_payment_method: formData.get("show_payment_method") === "on",
    show_amount: formData.get("show_amount") === "on",
    show_invoice_number: formData.get("show_invoice_number") === "on",
    show_customer: formData.get("show_customer") === "on",
    show_cashier: formData.get("show_cashier") === "on",
  };

  await supabase
    .from("mirror_accounts")
    .update({ permissions })
    .eq("id", mirrorAccountId)
    .eq("business_id", businessId);

  revalidatePath(`/business/${businessId}/mirror`);
}

export async function lockMirrorMonth(
  businessId: string,
  monthYear: string,
): Promise<{ error: string | null }> {
  let supabase;
  try {
    ({ supabase } = await assertIsOwner(businessId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tidak diizinkan." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("mirror_month_locks").insert({
    business_id: businessId,
    month_year: monthYear,
    locked_by: user!.id,
  });

  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}/mirror`);
  return { error: null };
}

export async function unlockMirrorMonth(
  businessId: string,
  monthYear: string,
): Promise<{ error: string | null }> {
  let supabase;
  try {
    ({ supabase } = await assertIsOwner(businessId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tidak diizinkan." };
  }

  const { error } = await supabase
    .from("mirror_month_locks")
    .delete()
    .eq("business_id", businessId)
    .eq("month_year", monthYear);

  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}/mirror`);
  return { error: null };
}

export async function revokeMirrorAccess(businessId: string, mirrorAccountId: string) {
  await assertIsOwner(businessId);

  const service = createServiceClient();

  // Ambil user_id + detail dulu sebelum row dihapus
  const { data: account } = await service
    .from("mirror_accounts")
    .select("user_id, invited_email, permissions")
    .eq("id", mirrorAccountId)
    .eq("business_id", businessId)
    .single();

  // Catat ke activity log sebelum dihapus (best-effort, tidak gagalkan revoke)
  if (account) {
    const permLabels = Object.entries(account.permissions as Record<string, boolean>)
      .filter(([, v]) => v)
      .map(([k]) => k.replace("show_", ""))
      .join(", ");
    await logActivity(
      service,
      businessId,
      "pengaturan",
      "warning",
      `Akses mirror dicabut: ${account.invited_email}`,
      permLabels ? `Permission: ${permLabels}` : "Tanpa permission",
    ).catch(() => {});
  }

  // Hapus mirror_accounts — mirror_selections ikut terhapus via CASCADE
  await service
    .from("mirror_accounts")
    .delete()
    .eq("id", mirrorAccountId)
    .eq("business_id", businessId);

  // Hapus auth user sehingga user tidak bisa login sama sekali
  if (account?.user_id) {
    await service.auth.admin.deleteUser(account.user_id);
  }

  revalidatePath(`/business/${businessId}/mirror`);
}

export type ResendInviteState = { error: string | null; success: boolean };

export async function resendMirrorInvite(
  businessId: string,
  mirrorAccountId: string,
): Promise<ResendInviteState> {
  try {
    await assertIsOwner(businessId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tidak diizinkan.", success: false };
  }

  const service = createServiceClient();
  const { data: account } = await service
    .from("mirror_accounts")
    .select("invited_email, status")
    .eq("id", mirrorAccountId)
    .eq("business_id", businessId)
    .single();

  if (!account) return { error: "Akun mirror tidak ditemukan.", success: false };
  if (account.status === "active") return { error: "Akun sudah aktif, tidak perlu kirim ulang.", success: false };

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "";

  const inviteClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, flowType: "implicit" } },
  );

  const { data, error } = await inviteClient.auth.admin.inviteUserByEmail(
    account.invited_email,
    { redirectTo: `${origin}/set-password` },
  );

  if (error || !data?.user) {
    return { error: error?.message ?? "Gagal mengundang ulang.", success: false };
  }

  // Kalau user auth lama sudah dihapus (mis. dihapus manual di Supabase
  // Dashboard), inviteUserByEmail membuat auth.users.id BARU untuk email
  // yang sama. Baris mirror_accounts masih menyimpan id lama, jadi RLS
  // "user_id = auth.uid()" nanti tidak match dan user dilempar ke
  // /onboarding. Selaraskan user_id ke id baru supaya login berikutnya
  // langsung ketemu.
  await service
    .from("mirror_accounts")
    .update({ user_id: data.user.id })
    .eq("id", mirrorAccountId)
    .eq("business_id", businessId);

  return { error: null, success: true };
}
