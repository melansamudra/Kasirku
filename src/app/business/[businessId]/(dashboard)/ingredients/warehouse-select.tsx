"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const WAREHOUSE_LABELS: Record<string, string> = {
  "": "— Gudang —",
  "Gudang Kering": "🌾 Gudang Kering",
  "Gudang Basah": "💧 Gudang Basah",
};

export default function WarehouseSelect({
  ingredientId,
  warehouse,
  action,
}: {
  ingredientId: string;
  warehouse: string | null;
  action: (ingredientId: string, warehouse: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(warehouse ?? "");
  const [pending, setPending] = useState(false);

  function handleChange(next: string) {
    setValue(next);
    setPending(true);
    action(ingredientId, next).then(() => {
      setPending(false);
      router.refresh();
    });
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      disabled={pending}
      className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10.5px] text-zinc-500 focus:border-brand-600 focus:outline-none disabled:opacity-50"
    >
      {Object.entries(WAREHOUSE_LABELS).map(([value_, label]) => (
        <option key={value_} value={value_}>
          {label}
        </option>
      ))}
    </select>
  );
}
