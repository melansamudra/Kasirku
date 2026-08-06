"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OptionGroupState } from "./actions";

export default function AddOptionGroupForm({
  action,
}: {
  action: (state: OptionGroupState, formData: FormData) => Promise<OptionGroupState>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [required, setRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) return;
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("required", String(required));
    const result = await action({ error: null }, fd);
    setPending(false);
    if (result.error) { setError(result.error); return; }
    setName("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Grup (mis. Pilih Minuman)
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pilih Minuman"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-xs text-zinc-700">Wajib dipilih</span>
      </label>
      {error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || !name.trim()}
        className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Tambah Grup"}
      </button>
    </div>
  );
}
