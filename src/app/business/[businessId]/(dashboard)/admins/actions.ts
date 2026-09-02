"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logActivity } from "@/lib/activity-log";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { buildLocationPermissionGroups } from "@/lib/location-permissions";

// `ALL_PERMISSION_KEYS` cuma daftar TETAP -- checklist juga menampilkan key
// per-lokasi dinamis (lihat permission-checklist.tsx/location-permissions.ts)
// yang tidak pernah ada di situ. `extraValidKeys` dihitung ulang di sini dari
// stock_locations BISNIS INI SENDIRI (bukan dipercaya dari client) supaya
// key per-lokasi bisnis lain tidak bisa diselundupkan lewat form ini.
function sanitizePermissions(raw: FormDataEntryValue[], extraValidKeys: Set<string>): string[] {
  return raw.map((v) => String(v)).filter((v) => ALL_PERMISSION_KEYS.has(v) || extraValidKeys.has(v));
}

async function loadLocationPermissionKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
): Promise<Set<string>> {
  const [{ data: business }, { data: locationRows }] = await Promise.all([
    supabase.from("businesses").select("cost_control_enabled, rich_stock_ops_enabled").eq("id", businessId).single(),
    supabase.from("stock_locations").select("id, name, is_production, is_default_purchase").eq("business_id", businessId),
  ]);
  const groups = buildLocationPermissionGroups(
    (locationRows ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      isProduction: l.is_production,
      isDefaultPurchase: l.is_default_purchase,
    })),
    business?.cost_control_enabled || business?.rich_stock_ops_enabled ? "full" : "simple",
  );
  return new Set(groups.flatMap((g) => g.items.map((i) => i.key)));
}

// Only the owner may ever reach these actions with a service-role client in
// play — inviteUserByEmail bypasses RLS entirely, so authorization has to be
// checked explicitly in code here rather than left to the database.
async function assertIsOwner(businessId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: business } = await supabase
    .from("businesses")
    .select("owner_id")
    .eq("id", businessId)
    .single();

  if (!business || !user || business.owner_id !== user.id) {
    throw new Error("Hanya pemilik toko yang bisa mengelola admin.");
  }

  return { supabase, ownerId: user.id };
}

export type InviteAdminState = { error: string | null };

export async function inviteAdmin(
  businessId: string,
  _prevState: InviteAdminState,
  formData: FormData,
): Promise<InviteAdminState> {
  try {
    return await _inviteAdminInner(businessId, formData);
  } catch (e) {
    console.error("[inviteAdmin] unexpected error:", e);
    return {
      error:
        e instanceof Error ? e.message : "Terjadi kesalahan tak terduga. Coba lagi.",
    };
  }
}

async function _inviteAdminInner(
  businessId: string,
  formData: FormData,
): Promise<InviteAdminState> {
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const roleRaw = formData.get("role") as string;
  const role = roleRaw === "admin" ? "admin" : "kasir";

  if (!name) {
    return { error: "Nama admin wajib diisi." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email tidak valid." };
  }

  let supabase;
  try {
    ({ supabase } = await assertIsOwner(businessId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tidak diizinkan." };
  }

  const locationKeys = await loadLocationPermissionKeys(supabase, businessId);
  const permissions = sanitizePermissions(formData.getAll("permissions"), locationKeys);

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "";

  const serviceClient = createServiceClient();
  let invitedUserId: string;
  try {
    const { data, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${origin}/reset-password` },
    );
    if (inviteError || !data?.user) {
      return {
        error:
          inviteError?.message ??
          "Gagal mengundang. Kalau email ini sudah terdaftar di Kasirku, gunakan email lain.",
      };
    }
    invitedUserId = data.user.id;
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Gagal mengundang. Kalau email ini sudah terdaftar di Kasirku, gunakan email lain.",
    };
  }

  const { error: staffError } = await supabase.from("business_staff").insert({
    business_id: businessId,
    user_id: invitedUserId,
    name,
    email,
    permissions,
    role,
  });

  if (staffError) {
    const isUniqueViolation = staffError.code === "23505";
    return {
      error: isUniqueViolation
        ? "Email ini sudah terdaftar sebagai admin/kasir di outlet ini."
        : staffError.message,
    };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    `Admin diundang: ${name}`,
    email,
  );
  revalidatePath(`/business/${businessId}/admins`);
  return { error: null };
}

export type UpdatePermissionsState = { error: string | null };

export async function updateAdminPermissions(
  businessId: string,
  staffId: string,
  _prevState: UpdatePermissionsState,
  formData: FormData,
): Promise<UpdatePermissionsState> {
  const roleRaw = formData.get("role") as string;
  const role = roleRaw === "admin" ? "admin" : "kasir";

  let supabase;
  try {
    ({ supabase } = await assertIsOwner(businessId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tidak diizinkan." };
  }

  const locationKeys = await loadLocationPermissionKeys(supabase, businessId);
  const permissions = sanitizePermissions(formData.getAll("permissions"), locationKeys);

  const { error } = await supabase
    .from("business_staff")
    .update({ permissions, role })
    .eq("id", staffId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "pengaturan", "info", "Izin admin diperbarui");
  revalidatePath(`/business/${businessId}/admins`);
  return { error: null };
}

export async function setAdminActive(businessId: string, staffId: string, active: boolean) {
  const { supabase } = await assertIsOwner(businessId);

  const { data: staff } = await supabase
    .from("business_staff")
    .select("name")
    .eq("id", staffId)
    .eq("business_id", businessId)
    .maybeSingle();

  await supabase
    .from("business_staff")
    .update({ active })
    .eq("id", staffId)
    .eq("business_id", businessId);

  if (staff) {
    await logActivity(
      supabase,
      businessId,
      "pengaturan",
      active ? "sukses" : "warning",
      `Admin ${active ? "diaktifkan" : "dinonaktifkan"}: ${staff.name}`,
    );
  }
  revalidatePath(`/business/${businessId}/admins`);
}

export async function removeAdmin(businessId: string, staffId: string) {
  const { supabase } = await assertIsOwner(businessId);

  const { data: staff } = await supabase
    .from("business_staff")
    .select("name")
    .eq("id", staffId)
    .eq("business_id", businessId)
    .maybeSingle();

  await supabase.from("business_staff").delete().eq("id", staffId).eq("business_id", businessId);

  if (staff) {
    await logActivity(supabase, businessId, "pengaturan", "warning", `Admin dihapus: ${staff.name}`);
  }
  revalidatePath(`/business/${businessId}/admins`);
}
