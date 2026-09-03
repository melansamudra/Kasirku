"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEPARTMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "dapur", label: "🍳 Dapur" },
  { value: "bar", label: "🍹 Bar" },
  { value: "front", label: "🛎️ Front" },
];

export default function DepartmentSelect({
  ingredientId,
  departments,
  action,
}: {
  ingredientId: string;
  departments: string[];
  action: (ingredientId: string, departments: string[]) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string[]>(departments);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function toggle(dep: string) {
    const next = value.includes(dep) ? value.filter((d) => d !== dep) : [...value, dep];
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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10.5px] text-zinc-500 hover:border-brand-300 disabled:opacity-50"
      >
        {value.length === 0
          ? "— Divisi —"
          : value.map((d) => DEPARTMENT_OPTIONS.find((o) => o.value === d)?.label ?? d).join(" ")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-32 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg">
            {DEPARTMENT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={value.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-3 w-3"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
