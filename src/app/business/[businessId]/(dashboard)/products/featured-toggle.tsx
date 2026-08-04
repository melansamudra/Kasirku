"use client";

import { useTransition } from "react";
import { toggleFeatured } from "./actions";

export default function FeaturedToggle({
  businessId,
  productId,
  featured,
}: {
  businessId: string;
  productId: string;
  featured: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(() => toggleFeatured(businessId, productId, !featured))
      }
      title={featured ? "Hapus dari unggulan" : "Tandai sebagai unggulan"}
      className={`shrink-0 text-sm transition-opacity ${pending ? "opacity-40" : ""} ${featured ? "text-amber-400 hover:text-amber-300" : "text-zinc-300 hover:text-amber-400"}`}
    >
      ★
    </button>
  );
}
