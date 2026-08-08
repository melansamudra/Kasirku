"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";

export default function DateRangeFilter({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const f = fd.get("from") as string;
    const t = fd.get("to") as string;
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function reset() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  const hasFilter = from || to;

  return (
    <form
      onSubmit={apply}
      className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3"
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase text-zinc-400">
          Dari Tanggal
        </label>
        <input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-900 focus:border-brand-400 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase text-zinc-400">
          Sampai Tanggal
        </label>
        <input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-900 focus:border-brand-400 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "..." : "Filter"}
      </button>
      {hasFilter && (
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="rounded-lg border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-50"
        >
          Reset
        </button>
      )}
      {hasFilter && (
        <span className="text-xs text-brand-600 font-medium">
          Filter aktif: {from ?? "..."} → {to ?? "..."}
        </span>
      )}
    </form>
  );
}
