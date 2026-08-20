"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteLateTierButton({
  action,
}: {
  action: () => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    const result = await action();
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="shrink-0 text-right">
      <button
        onClick={handleClick}
        disabled={pending}
        className="text-xs font-medium text-zinc-400 hover:text-red-600 disabled:opacity-50"
      >
        {pending ? "…" : "Hapus"}
      </button>
      {error && <p className="mt-1 max-w-[140px] text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
