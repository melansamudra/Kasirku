"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePayslipAdjustment } from "../actions";

export default function DeleteAdjustmentButton({
  businessId,
  payslipId,
  adjustmentId,
}: {
  businessId: string;
  payslipId: string;
  adjustmentId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      onClick={async () => {
        setPending(true);
        await deletePayslipAdjustment(businessId, payslipId, adjustmentId);
        router.refresh();
      }}
      disabled={pending}
      className="shrink-0 text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50"
      title="Hapus"
    >
      ✕
    </button>
  );
}
