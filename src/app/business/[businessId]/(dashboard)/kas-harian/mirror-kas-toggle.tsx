"use client";

import { useState, useTransition } from "react";
import { Capacitor } from "@capacitor/core";
import { toggleKasMirrorVisibility } from "./mirror-actions";

export default function MirrorKasToggle({
  businessId,
  journalLineId,
  visible: initialVisible,
}: {
  businessId: string;
  journalLineId: string;
  visible: boolean;
}) {
  const [visible, setVisible] = useState(initialVisible);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (Capacitor.isNativePlatform()) return null;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const nextVisible = !visible;

    // Mematikan butuh popup konfirmasi asli (window.confirm) — bukan UI
    // inline yang menggantikan tombol di posisi yang sama, karena itu bikin
    // klik kedua (mis. klik ganda tanpa sengaja) gampang kena tombol "Ya"
    // dan mematikan toggle tanpa benar-benar dimaksud.
    if (!nextVisible) {
      if (!window.confirm("Matikan visibilitas mirror untuk baris kas ini?")) return;
    }

    setError(null);
    setVisible(nextVisible);
    startTransition(async () => {
      try {
        const result = await toggleKasMirrorVisibility(businessId, journalLineId, nextVisible);
        if (result.error) {
          setVisible(!nextVisible);
          setError(result.error);
        }
      } catch (e) {
        setVisible(!nextVisible);
        setError(e instanceof Error ? e.message : "Gagal menyimpan (unknown error).");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <p className="max-w-[140px] text-right text-[10px] font-medium text-red-500">{error}</p>
      )}
      <button
        onClick={handleClick}
        disabled={pending}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          visible ? "bg-brand-600" : "bg-zinc-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            visible ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
