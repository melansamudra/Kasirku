import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addMember } from "./actions";
import AddMemberForm from "./add-member-form";

export default async function MembersPage({
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

  const { data: members } = await supabase
    .from("members")
    .select("id, name, phone, member_code, valid_until")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  const boundAddMember = addMember.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Anggota — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Member berlangganan yang mendapat harga tiket khusus.
      </p>

      <div className="mt-6 space-y-2">
        {members && members.length > 0 ? (
          members.map((m) => {
            const active = m.valid_until >= today;
            return (
              <Link
                key={m.id}
                href={`/business/${businessId}/members/${m.id}`}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-brand-300"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{m.name}</p>
                  <p className="text-xs text-zinc-500">
                    {m.member_code} · {m.phone || "Tanpa kontak"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    active ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-600"
                  }`}
                >
                  {active ? "Aktif" : "Kadaluarsa"}
                </span>
              </Link>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada member. Tambahkan supaya bisa dipilih saat checkout di kasir.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Member</h2>
        <AddMemberForm action={boundAddMember} />
      </div>
    </div>
  );
}
