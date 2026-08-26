"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WarehouseSelect({
  ingredientId,
  warehouseId,
  warehouses,
  action,
}: {
  ingredientId: string;
  warehouseId: string | null;
  warehouses: { id: string; name: string }[];
  action: (ingredientId: string, warehouseId: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(warehouseId ?? "");
  const [pending, setPending] = useState(false);

  function handleChange(next: string) {
    setValue(next);
    setPending(true);
    action(ingredientId, next)
      .then(() => {
        setPending(false);
        router.refresh();
      })
      .catch(() => {
        setPending(false);
      });
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      disabled={pending}
      className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10.5px] text-zinc-500 focus:border-brand-600 focus:outline-none disabled:opacity-50"
    >
      <option value="">— Gudang —</option>
      {warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}
