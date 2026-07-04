"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCashierActive } from "./actions";

export default function ToggleActiveButton({
  businessId,
  cashierId,
  active,
}: {
  businessId: string;
  cashierId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await setCashierActive(businessId, cashierId, !active);
          router.refresh();
        })
      }
      disabled={pending}
      className={`shrink-0 text-xs font-medium hover:underline disabled:opacity-50 ${
        active ? "text-zinc-400 hover:text-red-500" : "text-zinc-400 hover:text-brand-600"
      }`}
    >
      {active ? "Nonaktifkan" : "Aktifkan"}
    </button>
  );
}
