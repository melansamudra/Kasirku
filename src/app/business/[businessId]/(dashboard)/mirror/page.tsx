import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { inviteMirrorAccount, updateMirrorPermissions } from "./actions";
import InviteMirrorForm from "./invite-mirror-form";
import RevokeButton from "./revoke-button";
import ResendInviteButton from "./resend-invite-button";
import MirrorPermissionChecklist from "./mirror-permission-checklist";
import RekapTab from "./rekap-tab";

type MirrorAccount = {
  id: string;
  invited_email: string;
  status: string;
  permissions: Record<string, boolean>;
};

export default async function MirrorPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ tab?: string; bulan?: string }>;
}) {
  const { businessId } = await params;
  const { tab, bulan } = await searchParams;
  const activeTab = tab === "rekap" ? "rekap" : "akun";

  const supabase = await createClient();

  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase.from("businesses").select("id, name, owner_id, mirroring_enabled").eq("id", businessId).single(),
    supabase.auth.getUser(),
  ]);
  const ownerEmail = userData.user?.email ?? "";

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
        Kelola akun baca-saja dan lihat rekap transaksi yang sudah ditandai.
      </p>

      {/* Tab Navigation */}
      <div className="mt-5 flex gap-1 border-b border-zinc-200">
        <Link
          href={`/business/${businessId}/mirror`}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "akun"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Akun Mirror
        </Link>
        <Link
          href={`/business/${businessId}/mirror?tab=rekap`}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "rekap"
              ? "border-b-2 border-brand-600 text-brand-700"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Rekap & Kunci
        </Link>
      </div>

      {/* Tab: Akun Mirror */}
      {activeTab === "akun" && (
        <div className="mt-6 space-y-6">
          {accounts.length > 0 && (
            <div className="space-y-3">
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
                      {acc.status === "pending" && (
                        <div className="mt-1">
                          <ResendInviteButton businessId={businessId} mirrorAccountId={acc.id} />
                        </div>
                      )}
                    </div>
                    <RevokeButton
                      businessId={businessId}
                      mirrorAccountId={acc.id}
                      email={acc.invited_email}
                      ownerEmail={ownerEmail}
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

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900">Undang Akun Mirror Baru</h2>
            <InviteMirrorForm action={boundInvite} />
          </div>
        </div>
      )}

      {/* Tab: Rekap & Kunci */}
      {activeTab === "rekap" && (
        <div className="mt-6">
          <RekapTab businessId={businessId} bulan={bulan} />
        </div>
      )}
    </div>
  );
}
