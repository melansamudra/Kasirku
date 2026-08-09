"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

export default function DateRangeFilter({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [fromVal, setFromVal] = useState(from ?? "");
  const [toVal, setToVal] = useState(to ?? "");

  function handleApply() {
    const params = new URLSearchParams();
    if (fromVal) params.set("from", fromVal);
    if (toVal) params.set("to", toVal);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleReset() {
    setFromVal("");
    setToVal("");
    router.push(pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Dari
        </label>
        <input
          type="date"
          value={fromVal}
          onChange={(e) => setFromVal(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 focus:border-brand-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Sampai
        </label>
        <input
          type="date"
          value={toVal}
          onChange={(e) => setToVal(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 focus:border-brand-500 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={handleApply}
        className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Terapkan
      </button>
      {(from || to) && (
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-50"
        >
          Reset
        </button>
      )}
    </div>
  );
}
