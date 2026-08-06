"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OptionGroupState } from "./actions";

export default function AddOptionForm({
  action,
}: {
  action: (state: OptionGroupState, formData: FormData) => Promise<OptionGroupState>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) return;
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("price_adjustment", price || "0");
    const result = await action({ error: null }, fd);
    setPending(false);
    if (result.error) { setError(result.error); return; }
    setName("");
    setPrice("");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="mis. Es"
        className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <input
        type="number"
        min="0"
        step="1"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="+Rp (0=gratis)"
        className="w-32 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || !name.trim()}
        className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "…" : "Tambah"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
