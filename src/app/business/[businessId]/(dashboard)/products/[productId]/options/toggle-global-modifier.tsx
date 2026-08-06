"use client";

import { useTransition } from "react";
import { toggleGlobalModifier } from "./actions";

export default function ToggleGlobalModifier({
  businessId,
  productId,
  groupId,
  linked,
}: {
  businessId: string;
  productId: string;
  groupId: string;
  linked: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => toggleGlobalModifier(businessId, productId, groupId, linked))}
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        linked
          ? "bg-brand-50 text-brand-700 hover:bg-red-50 hover:text-red-600"
          : "border border-zinc-200 text-zinc-600 hover:border-brand-400 hover:text-brand-600"
      }`}
    >
      {pending ? "…" : linked ? "Terpasang ✓" : "Pasang"}
    </button>
  );
}
