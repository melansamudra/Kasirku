"use client";

import { useState } from "react";
import { submitKasKecilPortal } from "./actions";

const CATEGORIES = ["Bahan Baku", "Bukan Bahan Baku", "Lain-lain"];

export default function KasKecilFormClient({
  portalSlug,
  businessId,
  locationId,
}: {
  portalSlug: string;
  businessId: string;
  locationId: string;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    setPending(true);
    submitKasKecilPortal(portalSlug, businessId, locationId, Number(amount), category, description)
      .then((res) => {
        setPending(false);
        if (!res.success) {
          setError(res.error);
          return;
        }
        setSuccess(res.message);
        setAmount("");
        setCategory(CATEGORIES[0]);
        setDescription("");
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  if (success) {
    return (
      <div className="mt-4 rounded-xl bg-brand-50 p-4 text-center">
        <p className="text-sm font-semibold text-brand-800">✓ {success}</p>
        <button
          onClick={() => setSuccess(null)}
          className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Catat Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="text-xs font-medium text-zinc-600">Jumlah (Rp)</label>
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="mis. 50000"
          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-zinc-600">Kategori</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-zinc-600">Keterangan</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="mis. Beli galon air"
          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Menyimpan…" : "Simpan Pengeluaran"}
      </button>
      <p className="text-center text-[10.5px] text-zinc-400">
        Tersimpan sebagai draft, menunggu diklasifikasi Cost Control ke akun beban yang sesuai.
      </p>
    </div>
  );
}
