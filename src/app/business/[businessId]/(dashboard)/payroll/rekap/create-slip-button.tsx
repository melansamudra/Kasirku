"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatePayslipResult } from "../actions";

export default function CreateSlipButton({
  businessId,
  action,
}: {
  businessId: string;
  action: () => Promise<CreatePayslipResult>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    const result = await action();
    setPending(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.push(`/business/${businessId}/payroll/${result.payslipId}`);
  }

  return (
    <div className="shrink-0 text-right">
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Membuat…" : "Buat Slip"}
      </button>
      {error && <p className="mt-1 max-w-[140px] text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
