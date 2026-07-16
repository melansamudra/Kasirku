import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import { editMember } from "../actions";
import DeleteMemberButton from "./delete-member-button";
import EditMemberForm from "./edit-member-form";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; memberId: string }>;
}) {
  const { businessId, memberId } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("id, name, phone, member_code, valid_from, valid_until, note")
    .eq("id", memberId)
    .eq("business_id", businessId)
    .single();

  if (!member) {
    notFound();
  }

  const { data: ticketTransactions } = await supabase
    .from("ticket_transactions")
    .select("id, invoice_number, date, total, voided")
    .eq("business_id", businessId)
    .eq("member_id", memberId)
    .order("date", { ascending: false })
    .limit(50);

  const validTransactions = (ticketTransactions ?? []).filter((t) => !t.voided);
  const totalSpent = validTransactions.reduce((sum, t) => sum + Number(t.total), 0);
  const lastVisit = validTransactions[0]?.date;
  const today = todayWibDateString();
  const active = member.valid_until >= today;

  const boundEditMember = editMember.bind(null, businessId, memberId);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-zinc-900">{member.name}</h1>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                active ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-600"
              }`}
            >
              {active ? "Aktif" : "Kadaluarsa"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {member.member_code}
            {member.phone ? ` · ${member.phone}` : ""}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Berlaku {new Date(`${member.valid_from}T00:00:00`).toLocaleDateString("id-ID")} s/d{" "}
            {new Date(`${member.valid_until}T00:00:00`).toLocaleDateString("id-ID")}
          </p>
          <Link
            href={`/business/${businessId}/members/${memberId}/card`}
            target="_blank"
            className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline"
          >
            🪪 Cetak Kartu
          </Link>
          {member.note && <p className="mt-1 text-xs text-zinc-400">{member.note}</p>}
        </div>
        <EditMemberForm
          name={member.name}
          phone={member.phone}
          memberCode={member.member_code}
          validFrom={member.valid_from}
          validUntil={member.valid_until}
          note={member.note}
          action={boundEditMember}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
          <p className="text-sm font-bold text-zinc-900">{validTransactions.length}</p>
          <p className="text-[10px] text-zinc-500">Kunjungan</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
          <p className="text-sm font-bold text-zinc-900">{formatRupiah(totalSpent)}</p>
          <p className="text-[10px] text-zinc-500">Total Belanja</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
          <p className="text-xs font-bold text-zinc-900">
            {lastVisit ? formatDateTime(lastVisit) : "—"}
          </p>
          <p className="text-[10px] text-zinc-500">Kunjungan Terakhir</p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">Riwayat Tiket</h2>
        {ticketTransactions && ticketTransactions.length > 0 ? (
          ticketTransactions.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-900">{t.invoice_number}</p>
                {t.voided ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                    Dibatalkan
                  </span>
                ) : (
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatRupiah(Number(t.total))}
                  </p>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-500">{formatDateTime(t.date)}</p>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada tiket yang dipakai member ini.
          </p>
        )}
      </div>

      <DeleteMemberButton businessId={businessId} memberId={memberId} />
    </div>
  );
}
