"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UpdateCategoryState } from "./actions";

const CATEGORIES = ["Bahan Baku", "Barang Dagang", "Lainnya"] as const;

export default function EditCategoryButton({
  currentCategory,
  action,
}: {
  currentCategory: string;
  action: (newCategory: string) => Promise<UpdateCategoryState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(currentCategory);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    setPending(true);
    action(category)
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        setOpen(false);
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-zinc-400 hover:text-brand-700"
      >
        Ubah kategori
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-brand-200 bg-brand-50 p-2.5">
      <p className="text-[11px] font-medium text-brand-800">Ubah kategori pembelian ini</p>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="mt-2 w-full rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={pending || category === currentCategory}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
            setCategory(currentCategory);
          }}
          className="text-[11px] text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
