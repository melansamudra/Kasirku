import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inviteAdmin, updateAdminPermissions } from "./actions";
import InviteAdminForm from "./invite-admin-form";
import EditPermissionsForm from "./edit-permissions-form";
import ToggleActiveButton from "./toggle-active-button";
import RemoveButton from "./remove-button";
import { PERMISSION_GROUPS } from "@/lib/permissions";

const LABEL_BY_KEY = new Map(
  PERMISSION_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i.label]),
);

export default async function AdminsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: staffRows } = await supabase
    .from("business_staff")
    .select("id, name, email, permissions, active")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

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
                {!s.active && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    Nonaktif
                  </span>
                )}
                <EditPermissionsForm
                  currentPermissions={s.permissions}
                  action={updateAdminPermissions.bind(null, businessId, s.id)}
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
        <InviteAdminForm action={boundInviteAdmin} />
      </div>
    </div>
  );
}
