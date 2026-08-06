"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessProfileState } from "./actions";

export default function BusinessProfileForm({
  action,
  name,
  address,
  phone,
}: {
  action: (state: BusinessProfileState, formData: FormData) => Promise<BusinessProfileState>;
  name: string;
  address: string | null;
  phone: string | null;
}) {
  const router = useRouter();
  const [nameVal, setNameVal] = useState(name);
  const [addressVal, setAddressVal] = useState(address ?? "");
  const [phoneVal, setPhoneVal] = useState(phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSaved(false);
    setPending(true);
    const fd = new FormData();
    fd.set("name", nameVal);
    fd.set("address", addressVal);
    fd.set("phone", phoneVal);
    const result = await action({ error: null }, fd);
    setPending(false);
    if (result.error) { setError(result.error); return; }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">Nama Toko</label>
        <input
          type="text"
          value={nameVal}
          onChange={(e) => { setNameVal(e.target.value); setSaved(false); }}
          placeholder="mis. Warung Makan Pak Budi"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">Alamat</label>
        <textarea
          value={addressVal}
          onChange={(e) => { setAddressVal(e.target.value); setSaved(false); }}
          placeholder="mis. Jl. Sudirman No. 12, Semarang"
          rows={2}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">Nomor HP / Telepon</label>
        <input
          type="tel"
          value={phoneVal}
          onChange={(e) => { setPhoneVal(e.target.value); setSaved(false); }}
          placeholder="mis. 0812-3456-7890"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || !nameVal.trim()}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "Menyimpan…" : saved ? "Tersimpan ✓" : "Simpan"}
      </button>
    </div>
  );
}
