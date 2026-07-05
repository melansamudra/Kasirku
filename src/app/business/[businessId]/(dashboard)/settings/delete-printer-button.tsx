"use client";

import { useTransition } from "react";
import { deleteKitchenPrinter } from "./actions";

export default function DeletePrinterButton({
  businessId,
  printerId,
}: {
  businessId: string;
  printerId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => deleteKitchenPrinter(businessId, printerId))}
      disabled={pending}
      className="shrink-0 text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50"
      title="Hapus"
    >
      ✕
    </button>
  );
}
