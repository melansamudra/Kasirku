"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePayslip } from "./actions";

export default function DeletePayslipButton({
  businessId,
  payslipId,
}: {
  businessId: string;
  payslipId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          setConfirming(true);
        }}
        className="shrink-0 text-xs text-zinc-400 hover:text-red-500"
        title="Hapus slip gaji"
      >
        🗑️
      </button>
    );
  }

  return (
    <div
      onClick={(e) => e.preventDefault()}
      className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs"
    >
      <span className="text-red-600">Hapus slip gaji ini?</span>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={async (e) => {
            e.preventDefault();
            setPending(true);
            await deletePayslip(businessId, payslipId);
            router.refresh();
          }}
          disabled={pending}
          className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menghapus…" : "Ya, Hapus"}
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            setConfirming(false);
          }}
          className="rounded-lg px-2 py-1 font-medium text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
