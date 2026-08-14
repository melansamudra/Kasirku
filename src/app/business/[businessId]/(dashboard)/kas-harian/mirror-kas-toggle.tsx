"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  // Kalau server ngirim data terbaru (mis. setelah revalidate dari toggle
  // lain / tab lain), samakan state lokal — kalau tidak, toggle ini
  // kelihatan "nyangkut" di nilai lama sampai halaman di-reload manual.
  useEffect(() => {
    if (!pending) setVisible(initialVisible);
  }, [initialVisible, pending]);

  if (Capacitor.isNativePlatform()) return null;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (visible) {
      setConfirming(true);
    } else {
      setVisible(true);
      startTransition(async () => {
        const result = await toggleKasMirrorVisibility(businessId, journalLineId, true);
        if (result.error) setVisible(false);
      });
    }
  }

  function handleConfirmOff(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
    setVisible(false);
    startTransition(async () => {
      const result = await toggleKasMirrorVisibility(businessId, journalLineId, false);
      if (result.error) setVisible(true);
    });
  }

  function handleCancel(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  }

  if (confirming) {
    return (
      <div
        className="flex flex-col items-end gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-medium text-zinc-500 whitespace-nowrap">Matikan?</p>
        <div className="flex gap-1">
          <button
            onClick={handleConfirmOff}
            className="rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-600"
          >
            Ya
          </button>
          <button
            onClick={handleCancel}
            className="rounded-md border border-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-500 hover:bg-zinc-50"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
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
  );
}
