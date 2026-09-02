import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inviteAdmin, updateAdminPermissions } from "./actions";
import InviteAdminForm from "./invite-admin-form";
import EditPermissionsForm from "./edit-permissions-form";
import ToggleActiveButton from "./toggle-active-button";
import RemoveButton from "./remove-button";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { buildLocationPermissionGroups } from "@/lib/location-permissions";

export default async function AdminsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const [{ data: staffRows }, { data: locationRows }] = await Promise.all([
    supabase
      .from("business_staff")
      .select("id, name, email, permissions, active, role")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase
      .from("stock_locations")
      .select("id, name, is_production, is_default_purchase")
      .eq("business_id", businessId),
  ]);

  // Kosong buat bisnis yang tidak punya baris stock_locations sama sekali --
  // checklist-nya otomatis cuma tampilkan yang statis, tidak ada dampak buat
  // bisnis lain. Mode "simple" (Adi's Culinary dkk, stock_locations_enabled
  // tanpa cost_control_enabled) dipakai karena lokasi mereka semua setara
  // (bukan is_production/is_default_purchase seperti Llauk) -- lihat
  // location-permissions.ts.
  const locationGroups = buildLocationPermissionGroups(
    (locationRows ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      isProduction: l.is_production,
      isDefaultPurchase: l.is_default_purchase,
    })),
    business.cost_control_enabled || business.rich_stock_ops_enabled ? "full" : "simple",
  );

  const LABEL_BY_KEY = new Map(
    [...PERMISSION_GROUPS, ...locationGroups].flatMap((g) => g.items).map((i) => [i.key, i.label]),
  );

  const boundInviteAdmin = inviteAdmin.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Kelola Admin — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Undang orang lain untuk login ke backoffice ini dengan akun email/password sendiri, dan
        atur fitur mana saja yang boleh mereka akses.
      </p>

      <div className="mt-6 space-y-2">
        {staffRows && staffRows.length > 0 ? (
          staffRows.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">{s.name}</p>
                <p className="text-xs text-zinc-500">{s.email}</p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  {s.permissions.length > 0
                    ? s.permissions.map((k: string) => LABEL_BY_KEY.get(k) ?? k).join(", ")
                    : "Belum ada fitur diberikan"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    s.role === "admin" ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {s.role === "admin" ? "⚙️ Admin" : "🧾 Kasir"}
                </span>
                {!s.active && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    Nonaktif
                  </span>
                )}
                <EditPermissionsForm
                  currentPermissions={s.permissions}
                  currentRole={s.role === "admin" ? "admin" : "kasir"}
                  action={updateAdminPermissions.bind(null, businessId, s.id)}
                  extraGroups={locationGroups}
                />
                <ToggleActiveButton businessId={businessId} staffId={s.id} active={s.active} />
                <RemoveButton businessId={businessId} staffId={s.id} name={s.name} />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada admin yang diundang.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Undang Admin</h2>
        <InviteAdminForm action={boundInviteAdmin} extraGroups={locationGroups} />
      </div>
    </div>
  );
}
