"use client";

import { useState, useTransition } from "react";
import { Capacitor } from "@capacitor/core";
import { toggleTransactionMirrorVisibility } from "./mirror-actions";

export default function MirrorToggle({
  businessId,
  transactionId,
  visible: initialVisible,
}: {
  businessId: string;
  transactionId: string;
  visible: boolean;
}) {
  const [visible, setVisible] = useState(initialVisible);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (Capacitor.isNativePlatform()) return null;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (visible) {
      setConfirming(true);
    } else {
      setVisible(true);
      startTransition(() => {
        toggleTransactionMirrorVisibility(businessId, transactionId, true);
      });
    }
  }

  function handleConfirmOff(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
    setVisible(false);
    startTransition(() => {
      toggleTransactionMirrorVisibility(businessId, transactionId, false);
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
        className="flex flex-col items-end gap-1 border-l border-zinc-100 px-3"
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
    <div className="flex items-center border-l border-zinc-100 px-3">
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
