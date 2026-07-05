"use client";

import { useTransition } from "react";
import { removeRecipeItem } from "./actions";

export default function RemoveRecipeButton({
  businessId,
  productId,
  recipeItemId,
}: {
  businessId: string;
  productId: string;
  recipeItemId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => removeRecipeItem(businessId, productId, recipeItemId))}
      disabled={pending}
      className="text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50"
    >
      ✕
    </button>
  );
}
