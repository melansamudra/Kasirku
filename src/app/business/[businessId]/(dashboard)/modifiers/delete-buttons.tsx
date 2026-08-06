"use client";

import { useTransition } from "react";
import { deleteGlobalModifierGroup, deleteGlobalModifierOption } from "./actions";

export function DeleteGroupButton({ businessId, groupId }: { businessId: string; groupId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => deleteGlobalModifierGroup(businessId, groupId))}
      disabled={pending}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
    >
      {pending ? "…" : "Hapus grup"}
    </button>
  );
}

export function DeleteOptionButton({ businessId, optionId }: { businessId: string; optionId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => deleteGlobalModifierOption(businessId, optionId))}
      disabled={pending}
      className="text-zinc-300 hover:text-red-500 disabled:opacity-40"
      title="Hapus pilihan"
    >
      {pending ? "…" : "×"}
    </button>
  );
}
