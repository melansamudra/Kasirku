"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteMember } from "../actions";

export default function DeleteMemberButton({
  businessId,
  memberId,
}: {
  businessId: string;
  memberId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    await deleteMember(businessId, memberId);
    router.push(`/business/${businessId}/members`);
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-6 w-full rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
      >
        Hapus Member
      </button>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-red-200 bg-white p-4 text-center">
      <p className="text-xs text-zinc-500">Yakin hapus member ini? Riwayat tiket tetap tersimpan.</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleDelete}
          disabled={pending}
          className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menghapus…" : "Ya, Hapus"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-xl border border-zinc-200 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
