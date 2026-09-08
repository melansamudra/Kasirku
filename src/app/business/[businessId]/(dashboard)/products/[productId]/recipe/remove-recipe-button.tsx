"use client";

import { useTransition } from "react";
import { removeRecipeItem } from "./actions";

export default function RemoveRecipeButton({
  businessId,
  productId,
  recipeItemId,
  onRemoved,
}: {
  businessId: string;
  productId: string;
  recipeItemId: string;
  onRemoved?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await removeRecipeItem(businessId, productId, recipeItemId);
          onRemoved?.();
        })
      }
      disabled={pending}
      className="text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50"
    >
      ✕
    </button>
  );
}
