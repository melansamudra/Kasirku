import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inviteMirrorAccount, updateMirrorPermissions } from "./actions";
import InviteMirrorForm from "./invite-mirror-form";
import RevokeButton from "./revoke-button";
import MirrorPermissionChecklist from "./mirror-permission-checklist";

type MirrorAccount = {
  id: string;
  invited_email: string;
  status: string;
  permissions: Record<string, boolean>;
};

export default async function MirrorPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase.from("businesses").select("id, name, owner_id, mirroring_enabled").eq("id", businessId).single(),
    supabase.auth.getUser(),
  ]);

  if (!business) notFound();
  if (business.owner_id !== userData.user?.id) redirect(`/business/${businessId}`);
  if (!business.mirroring_enabled) redirect(`/business/${businessId}`);

  const { data: mirrorAccounts } = await supabase
    .from("mirror_accounts")
    .select("id, invited_email, status, permissions")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  const accounts = (mirrorAccounts ?? []) as MirrorAccount[];
  const boundInvite = inviteMirrorAccount.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Akun Mirror — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Undang akun baca-saja untuk melihat data transaksi yang Anda pilih.
        Akun mirror tidak bisa mengubah data apapun.
      </p>

      {accounts.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Akun Mirror Aktif
          </p>
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{acc.invited_email}</p>
                  <p className="text-xs text-zinc-400">
                    {acc.status === "active" ? "✅ Aktif" : "⏳ Menunggu konfirmasi email"}
                  </p>
                </div>
                <RevokeButton
                  businessId={businessId}
                  mirrorAccountId={acc.id}
                  email={acc.invited_email}
                />
              </div>

              <form
                action={updateMirrorPermissions.bind(null, businessId, acc.id)}
                className="mt-3"
              >
                <p className="mb-1.5 text-[11px] font-medium text-zinc-500">Data yang bisa dilihat:</p>
                <MirrorPermissionChecklist defaultValues={acc.permissions} />
                <button
                  type="submit"
                  className="mt-2 rounded-lg border border-zinc-200 px-3 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Simpan Perubahan
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Undang Akun Mirror Baru</h2>
        <InviteMirrorForm action={boundInvite} />
      </div>
    </div>
  );
}
