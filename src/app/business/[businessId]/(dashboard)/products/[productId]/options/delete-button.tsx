"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteButton({
  label,
  action,
  small,
}: {
  label: string;
  action: () => Promise<void>;
  small?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handle() {
    setPending(true);
    await action();
    router.refresh();
    setPending(false);
  }

  if (small) {
    return (
      <button
        type="button"
        onClick={handle}
        disabled={pending}
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
      >
        {pending ? "…" : "×"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="shrink-0 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
    >
      {pending ? "…" : label}
    </button>
  );
}
