"use client";

import { useTransition } from "react";
import { deletePaymentMethod } from "./actions";

export default function DeletePaymentMethodButton({
  businessId,
  methodId,
}: {
  businessId: string;
  methodId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => deletePaymentMethod(businessId, methodId))}
      disabled={pending}
      className="shrink-0 text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50"
      title="Hapus"
    >
      ✕
    </button>
  );
}
