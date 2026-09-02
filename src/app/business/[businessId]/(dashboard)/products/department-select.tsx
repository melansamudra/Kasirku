"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEPARTMENT_LABELS: Record<string, string> = {
  "": "— Divisi —",
  dapur: "🍳 Dapur",
  bar: "🍹 Bar",
  front: "🛎️ Front",
};

export default function ProductDepartmentSelect({
  productId,
  department,
  action,
}: {
  productId: string;
  department: string | null;
  action: (productId: string, department: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(department ?? "");
  const [pending, setPending] = useState(false);

  function handleChange(next: string) {
    setValue(next);
    setPending(true);
    action(productId, next)
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
      {Object.entries(DEPARTMENT_LABELS).map(([value_, label]) => (
        <option key={value_} value={value_}>
          {label}
        </option>
      ))}
    </select>
  );
}
