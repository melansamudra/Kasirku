"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StorefrontTaglineState } from "./actions";

export default function StorefrontTaglineForm({
  action,
  tagline,
  storefrontUrl,
}: {
  action: (state: StorefrontTaglineState, formData: FormData) => Promise<StorefrontTaglineState>;
  tagline: string | null;
  storefrontUrl: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(tagline ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSaved(false);
    setPending(true);
    const fd = new FormData();
    fd.set("tagline", value);
    const result = await action({ error: null }, fd);
    setPending(false);
    if (result.error) { setError(result.error); return; }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Halaman publik toko:{" "}
        <a href={storefrontUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 hover:underline">
          {storefrontUrl}
        </a>
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700">Tagline (tampil di landing)</label>
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          placeholder="mis. Mie ayam favorit sejak 2020"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "Menyimpan…" : saved ? "Tersimpan ✓" : "Simpan"}
      </button>
    </div>
  );
}
