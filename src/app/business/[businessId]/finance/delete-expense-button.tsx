"use client";

import { useTransition } from "react";
import { deleteExpense } from "./actions";

export default function DeleteExpenseButton({
  businessId,
  expenseId,
}: {
  businessId: string;
  expenseId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => deleteExpense(businessId, expenseId))}
      disabled={pending}
      className="shrink-0 text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50"
      title="Hapus"
    >
      ✕
    </button>
  );
}
