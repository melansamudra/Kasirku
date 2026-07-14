"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markInvoicePaid } from "../actions";

export default function MarkPaidButton({
  businessId,
  invoiceId,
}: {
  businessId: string;
  invoiceId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await markInvoicePaid(businessId, invoiceId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="print:hidden">
      <button
        onClick={handleClick}
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Tandai Lunas"}
      </button>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
