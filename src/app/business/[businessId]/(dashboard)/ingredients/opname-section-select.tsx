"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OpnameSectionSelect({
  ingredientId,
  sectionId,
  sections,
  action,
}: {
  ingredientId: string;
  sectionId: string | null;
  sections: { id: string; name: string }[];
  action: (ingredientId: string, sectionId: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(sectionId ?? "");
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
      <option value="">— Bagian —</option>
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
