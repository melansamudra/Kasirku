"use client";

import { useTransition } from "react";
import { toggleStorefront } from "./actions";

export default function ToggleStorefrontButton({
  businessId,
  enabled,
}: {
  businessId: string;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleStorefront(businessId, !enabled);
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      title={enabled ? "Nonaktifkan Toko Online" : "Aktifkan Toko Online"}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
        enabled ? "bg-indigo-500" : "bg-zinc-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
