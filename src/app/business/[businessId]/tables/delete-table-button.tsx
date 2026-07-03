"use client";

import { useTransition } from "react";
import { deleteTable } from "./actions";

export default function DeleteTableButton({
  businessId,
  tableId,
}: {
  businessId: string;
  tableId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => deleteTable(businessId, tableId))}
      disabled={pending}
      className="shrink-0 text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50"
      title="Hapus"
    >
      ✕
    </button>
  );
}
