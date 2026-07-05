"use client";

import { useTransition } from "react";
import { setSelfOrderStatus } from "./actions";

export default function OrderStatusButton({
  businessId,
  orderId,
  nextStatus,
  label,
}: {
  businessId: string;
  orderId: string;
  nextStatus: "diproses" | "selesai";
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(() => setSelfOrderStatus(businessId, orderId, nextStatus))
      }
      disabled={pending}
      className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "…" : label}
    </button>
  );
}
