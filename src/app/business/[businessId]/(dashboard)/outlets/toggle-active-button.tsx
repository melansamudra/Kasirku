"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleOutletActive } from "./actions";

export default function ToggleActiveButton({
  businessId,
  outletId,
  active,
}: {
  businessId: string;
  outletId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleOutletActive(businessId, outletId, !active);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
        active ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
      }`}
      title={active ? "Nonaktifkan outlet" : "Aktifkan outlet"}
    >
      {active ? "Aktif" : "Nonaktif"}
    </button>
  );
}
