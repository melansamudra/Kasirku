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
  const [confirming, setConfirming] = useState(false);
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
    if (visible) {
      setConfirming(true);
    } else {
      setError(null);
      setVisible(true);
      startTransition(async () => {
        try {
          const result = await toggleTransactionMirrorVisibility(businessId, transactionId, true);
          if (result.error) {
            setVisible(false);
            setError(result.error);
          }
        } catch (e) {
          setVisible(false);
          setError(e instanceof Error ? e.message : "Gagal menyimpan (unknown error).");
        }
      });
    }
  }

  function handleConfirmOff(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
    setError(null);
    setVisible(false);
    startTransition(async () => {
      try {
        const result = await toggleTransactionMirrorVisibility(businessId, transactionId, false);
        if (result.error) {
          setVisible(true);
          setError(result.error);
        }
      } catch (e) {
        setVisible(true);
        setError(e instanceof Error ? e.message : "Gagal menyimpan (unknown error).");
      }
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
        <p className="whitespace-nowrap text-[10px] font-medium text-zinc-500">Matikan?</p>
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
