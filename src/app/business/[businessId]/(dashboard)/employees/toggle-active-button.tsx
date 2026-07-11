"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEmployeeActive } from "./actions";

export default function ToggleActiveButton({
  businessId,
  employeeId,
  active,
}: {
  businessId: string;
  employeeId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await setEmployeeActive(businessId, employeeId, !active);
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
