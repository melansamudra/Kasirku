"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LocationCategorySelect({
  locationId,
  locationName,
  categories,
  allCategories,
  action,
}: {
  locationId: string;
  locationName: string;
  categories: string[];
  allCategories: string[];
  action: (locationId: string, categories: string[]) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string[]>(categories);
  const [pending, setPending] = useState(false);

  function toggle(category: string) {
    const next = value.includes(category) ? value.filter((c) => c !== category) : [...value, category];
    setValue(next);
    setPending(true);
    action(locationId, next)
      .then(() => {
        setPending(false);
        router.refresh();
      })
      .catch(() => {
        setPending(false);
      });
  }

  if (allCategories.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Kategori Produk Lokasi Ini</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Pilih kategori menu yang dilayani {locationName} — pas ada penjualan, bahan baku resep menu
        kategori ini langsung dipotong dari stok {locationName}, tidak perlu nebak dari ketersediaan
        stok lagi. Kosongkan semua untuk balik ke cara lama (otomatis dari stok).
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {allCategories.map((c) => (
          <label key={c} className="flex items-center gap-1.5 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={value.includes(c)}
              onChange={() => toggle(c)}
              disabled={pending}
              className="h-3.5 w-3.5"
            />
            {c}
          </label>
        ))}
      </div>
    </div>
  );
}
