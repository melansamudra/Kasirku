"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlan } from "@/lib/billing/plans";

export async function toggleMirroring(businessId: string, enabled: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const service = createServiceClient();
  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return;

  await service
    .from("businesses")
    .update({ mirroring_enabled: enabled })
    .eq("id", businessId);
  revalidatePath("/admin");
}

// Modul Produksi & Distribusi (cost control) khusus dapur pusat semacam
// Lauk Nusantara — di-gate per-bisnis lewat kolom ini (bukan cuma permission
// key) supaya tidak muncul di semua bisnis fnb Kasirku lain.
export async function toggleCostControl(businessId: string, enabled: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const service = createServiceClient();
  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return;

  await service
    .from("businesses")
    .update({ cost_control_enabled: enabled })
    .eq("id", businessId);
  revalidatePath("/admin");
}

// Mode Stok: Simpel (default semua pendaftar baru sejak 2026-09-10, tanpa
// lokasi) vs Multi-Lokasi (Gudang+Kitchen+Bar, dulu selalu manual lewat SQL
// -- lihat memory project-warehouse-starter-kit). Nyalain toggle ini bikin
// starter kit 3 lokasi standar SEKALI (idempotent -- dicek dulu biar tidak
// dobel kalau di-toggle off lalu on lagi); matiin cuma matiin flag-nya,
// lokasi yang sudah ada TIDAK dihapus (konsisten sama toggle lain di sini).
export async function toggleStockLocations(businessId: string, enabled: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const service = createServiceClient();
  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return;

  await service
    .from("businesses")
    .update({ stock_locations_enabled: enabled })
    .eq("id", businessId);

  if (enabled) {
    const { data: existingLocations } = await service
      .from("stock_locations")
      .select("name")
      .eq("business_id", businessId);
    const existingNames = new Set((existingLocations ?? []).map((l) => l.name));

    const starterKit = [
      { name: "Gudang", sort_order: 0, is_default_purchase: true, is_production: false },
      { name: "Kitchen", sort_order: 1, is_default_purchase: false, is_production: true },
      { name: "Bar", sort_order: 2, is_default_purchase: false, is_production: false },
    ].filter((loc) => !existingNames.has(loc.name));

    if (starterKit.length > 0) {
      await service.from("stock_locations").insert(starterKit.map((loc) => ({ business_id: businessId, ...loc })));
    }
  }

  revalidatePath("/admin");
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "toko";
}

// Landing publik (menu + reservasi) untuk toko dengan domain custom (mis.
// Mie Kota) -- lihat rencana "Domain Custom + Halaman Publik per Toko".
// Slug dibuat sekali saat pertama diaktifkan, tetap dipakai walau toggle
// dimatikan lalu dinyalakan lagi (supaya link yang sudah dibagikan tidak putus).
export async function toggleStorefront(businessId: string, enabled: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const service = createServiceClient();
  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return;

  if (enabled) {
    const { data: biz } = await service
      .from("businesses")
      .select("name, storefront_slug")
      .eq("id", businessId)
      .single();

    let slug = biz?.storefront_slug;
    if (!slug) {
      const base = slugify(biz?.name ?? "toko");
      const { data: clash } = await service
        .from("businesses")
        .select("id")
        .eq("storefront_slug", base)
        .maybeSingle();
      slug = clash ? `${base}-${businessId.slice(0, 6)}` : base;
    }
    await service
      .from("businesses")
      .update({ storefront_enabled: true, storefront_slug: slug })
      .eq("id", businessId);
  } else {
    await service
      .from("businesses")
      .update({ storefront_enabled: false })
      .eq("id", businessId);
  }
  revalidatePath("/admin");
}

export async function saveCustomDomain(businessId: string, domain: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const service = createServiceClient();
  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return;

  // Terima "https://miekota.com/" atau sejenisnya -- simpan hostname-nya saja
  // karena itu yang dicocokkan langsung ke header Host request di proxy.
  let normalized: string | null = null;
  if (domain && domain.trim()) {
    try {
      normalized = new URL(
        domain.includes("://") ? domain : `https://${domain}`,
      ).hostname.toLowerCase();
    } catch {
      normalized = domain.trim().toLowerCase();
    }
  }

  await service
    .from("businesses")
    .update({ custom_domain: normalized })
    .eq("id", businessId);
  revalidatePath("/admin");
}

export type ActivateSubscriptionState = { error: string | null; resetToken: number };

export async function activateSubscriptionManually(
  businessId: string,
  prevState: ActivateSubscriptionState,
  formData: FormData,
): Promise<ActivateSubscriptionState> {
  const fail = (msg: string): ActivateSubscriptionState => ({
    error: msg,
    resetToken: prevState.resetToken,
  });

  // Verify session and admin status at the application layer.
  // We cannot rely on auth.uid() inside security-definer functions when
  // called from a server action — the JWT context is not forwarded to the
  // postgres function in all Supabase hosting configurations.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sesi tidak valid, silakan login ulang.");

  const service = createServiceClient();

  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return fail("Akun ini bukan admin.");

  const planCode = formData.get("planCode") as string;
  const note = (formData.get("note") as string)?.trim() || null;

  const plan = getPlan(planCode);
  if (!plan) return fail("Paket tidak ditemukan.");

  // Read current period_end so we can extend from the greater of now() vs
  // the existing end — same logic as the stored procedure.
  const { data: sub } = await service
    .from("subscriptions")
    .select("period_end")
    .eq("business_id", businessId)
    .maybeSingle();

  let newPeriodEnd: string | null = null;
  if (plan.periodDays !== null) {
    const now = new Date();
    const current = sub?.period_end ? new Date(sub.period_end) : now;
    const base = current > now ? current : now;
    base.setDate(base.getDate() + plan.periodDays);
    newPeriodEnd = base.toISOString();
  }

  const orderId =
    "MANUAL-" +
    businessId.replace(/-/g, "") +
    "-" +
    Math.floor(Date.now() / 1000).toString();

  const { error: payErr } = await service.from("payments").insert({
    business_id: businessId,
    plan_code: plan.code,
    order_id: orderId,
    amount: plan.price,
    status: "settlement",
    payment_type: "manual",
    raw_notification: { note, activated_by: "admin", activated_by_uid: user.id },
  });
  if (payErr) return fail(payErr.message);

  const { error: subErr } = await service.from("subscriptions").upsert(
    {
      business_id: businessId,
      plan_code: plan.code,
      status: "active",
      period_end: newPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  );
  if (subErr) return fail(subErr.message);

  revalidatePath("/admin");
  return { error: null, resetToken: prevState.resetToken + 1 };
}
