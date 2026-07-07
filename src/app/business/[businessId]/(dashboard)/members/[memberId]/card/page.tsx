import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MemberBarcode from "../member-barcode";
import PrintButton from "./print-button";

export default async function MemberCardPage({
  params,
}: {
  params: Promise<{ businessId: string; memberId: string }>;
}) {
  const { businessId, memberId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();

  const { data: member } = await supabase
    .from("members")
    .select("name, member_code, valid_until")
    .eq("id", memberId)
    .eq("business_id", businessId)
    .single();

  if (!business || !member) {
    notFound();
  }

  return (
    <div className="w-full max-w-xs print:max-w-none">
      <div className="print:hidden">
        <PrintButton businessId={businessId} memberId={memberId} />
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 text-center print:mt-0 print:rounded-none print:border-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {business.name}
        </p>
        <p className="mt-2 text-lg font-bold text-zinc-900">{member.name}</p>
        <div className="mt-4 flex justify-center">
          <MemberBarcode value={member.member_code} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Berlaku s/d {new Date(`${member.valid_until}T00:00:00`).toLocaleDateString("id-ID")}
        </p>
      </div>
    </div>
  );
}
