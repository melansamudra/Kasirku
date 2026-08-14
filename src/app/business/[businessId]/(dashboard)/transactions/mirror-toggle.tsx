"use client";

import { useState, useTransition } from "react";
import { Capacitor } from "@capacitor/core";
import { toggleTransactionMirrorVisibility } from "./mirror-actions";

export default function MirrorToggle({
  businessId,
  transactionId,
  visible: initialVisible,
  locked = false,
}: {
  businessId: string;
  transactionId: string;
  visible: boolean;
  locked?: boolean;
}) {
  const [visible, setVisible] = useState(initialVisible);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (Capacitor.isNativePlatform()) return null;

  if (locked) {
    return (
      <div
        className="flex items-center border-l border-zinc-100 px-3"
        title="Bulan ini sudah dikunci"
      >
        <span className="text-base leading-none text-zinc-300">🔒</span>
      </div>
    );
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const nextVisible = !visible;

    // Mematikan butuh popup konfirmasi asli (window.confirm) — bukan UI
    // inline yang menggantikan tombol di posisi yang sama, karena itu bikin
    // klik kedua (mis. klik ganda tanpa sengaja) gampang kena tombol "Ya"
    // dan mematikan toggle tanpa benar-benar dimaksud.
    if (!nextVisible) {
      if (!window.confirm("Matikan visibilitas mirror untuk transaksi ini?")) return;
    }

    setError(null);
    setVisible(nextVisible);
    startTransition(async () => {
      try {
        const result = await toggleTransactionMirrorVisibility(
          businessId,
          transactionId,
          nextVisible,
        );
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
    <div className="flex items-center gap-2 border-l border-zinc-100 px-3">
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
