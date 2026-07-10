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
        const result = await deletePayslipAdjustment(businessId, payslipId, adjustmentId);
        setPending(false);
        if (result.error) {
          alert(result.error);
          return;
        }
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
