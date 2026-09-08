"use client";

import { useTransition } from "react";
import { toggleHppChecked } from "./actions";

export default function HppCheckedToggle({
  businessId,
  productId,
  checked,
}: {
  businessId: string;
  productId: string;
  checked: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label
      title={checked ? "HPP sudah diperiksa" : "Tandai HPP sudah diperiksa"}
      className={`flex shrink-0 items-center gap-1 text-[11px] font-medium transition-opacity ${pending ? "opacity-40" : ""} ${checked ? "text-brand-600" : "text-zinc-400"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(() => toggleHppChecked(businessId, productId, next));
        }}
        className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
      />
      HPP dicek
    </label>
  );
}
