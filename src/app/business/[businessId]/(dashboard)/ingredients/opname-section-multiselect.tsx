"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OpnameSectionMultiSelect({
  ingredientId,
  sectionIds,
  sections,
  action,
}: {
  ingredientId: string;
  sectionIds: string[];
  sections: { id: string; name: string }[];
  action: (ingredientId: string, sectionIds: string[]) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string[]>(sectionIds);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function toggle(sectionId: string) {
    const next = value.includes(sectionId) ? value.filter((id) => id !== sectionId) : [...value, sectionId];
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

  if (sections.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10.5px] text-zinc-500 hover:border-brand-300 disabled:opacity-50"
      >
        {value.length === 0
          ? "— Bagian —"
          : value.map((id) => sections.find((s) => s.id === id)?.name ?? id).join(", ")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg">
            {sections.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={value.includes(s.id)}
                  onChange={() => toggle(s.id)}
                  className="h-3 w-3"
                />
                {s.name}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
