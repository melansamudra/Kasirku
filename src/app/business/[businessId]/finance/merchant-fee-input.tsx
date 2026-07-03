"use client";

import { useState, useTransition } from "react";
import { setMerchantFeePercent } from "./actions";

export default function MerchantFeeInput({
  businessId,
  method,
  feePercent,
}: {
  businessId: string;
  method: string;
  feePercent: number;
}) {
  const [value, setValue] = useState(String(feePercent));
  const [, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        type="number"
        min="0"
        step="0.1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const parsed = Number(value);
          const next = Number.isNaN(parsed) ? 0 : parsed;
          setValue(String(next));
          startTransition(() => setMerchantFeePercent(businessId, method, next));
        }}
        className="w-14 rounded-md border border-zinc-200 px-1 py-1 text-center text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      %
    </span>
  );
}
