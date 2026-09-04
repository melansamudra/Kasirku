"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LocationSectionSelect({
  locationId,
  locationName,
  sectionIds,
  sections,
  action,
}: {
  locationId: string;
  locationName: string;
  sectionIds: string[];
  sections: { id: string; name: string; count?: number }[];
  action: (locationId: string, sectionIds: string[]) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string[]>(sectionIds);
  const [pending, setPending] = useState(false);

  function toggle(sectionId: string) {
    const next = value.includes(sectionId) ? value.filter((id) => id !== sectionId) : [...value, sectionId];
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

  if (sections.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Bagian Lokasi Ini</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Pilih bagian mana yang termasuk {locationName} — daftar Bahan Baku di bawah otomatis
        kepangkas cuma yang termasuk bagian ini. Kosongkan semua untuk tampilkan semua bahan
        (default).
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {sections.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={value.includes(s.id)}
              onChange={() => toggle(s.id)}
              disabled={pending}
              className="h-3.5 w-3.5"
            />
            {s.name}
            {s.count !== undefined && <span className="text-zinc-400"> ({s.count} bahan)</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
