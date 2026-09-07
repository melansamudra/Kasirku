"use client";

import { useState, useTransition } from "react";
import { saveCustomDomain } from "./actions";

export default function EditCustomDomainForm({
  businessId,
  currentDomain,
}: {
  businessId: string;
  currentDomain: string | null;
}) {
  const [value, setValue] = useState(currentDomain ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      await saveCustomDomain(businessId, value.trim() || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="miekota.com"
        className="w-32 rounded-lg border border-zinc-200 px-1.5 py-1 text-[10px] focus:border-brand-600 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        {saved ? "✓" : "Simpan"}
      </button>
    </div>
  );
}
